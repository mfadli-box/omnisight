package main

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type agentIdentity struct {
	AgentID    string `json:"agent_id"`
	AgentToken string `json:"agent_token"`
}

type encryptedIdentity struct {
	Version int    `json:"version"`
	Nonce   string `json:"nonce"`
	Data    string `json:"data"`
}

func identityPath() string {
	if path := os.Getenv("OMNISIGHT_AGENT_CONFIG"); path != "" {
		return path
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(os.Getenv("ProgramData"), "OmniSight", "agent.json")
	}
	return "/etc/omnisight/agent.json"
}

func identityKey() ([]byte, error) {
	key, err := base64.StdEncoding.DecodeString(os.Getenv("OMNISIGHT_AGENT_KEY"))
	if err != nil || len(key) != 32 {
		return nil, errors.New("OMNISIGHT_AGENT_KEY must be a base64-encoded 32-byte key")
	}
	return key, nil
}

func loadIdentity(path string, key []byte) (agentIdentity, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return agentIdentity{}, err
	}
	if len(data) > 8192 {
		return agentIdentity{}, errors.New("identity file too large")
	}
	var envelope encryptedIdentity
	if json.Unmarshal(data, &envelope) != nil || envelope.Version != 1 {
		return agentIdentity{}, errors.New("invalid identity file")
	}
	nonce, err := base64.StdEncoding.DecodeString(envelope.Nonce)
	if err != nil {
		return agentIdentity{}, errors.New("invalid identity nonce")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(envelope.Data)
	if err != nil {
		return agentIdentity{}, errors.New("invalid identity data")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return agentIdentity{}, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return agentIdentity{}, err
	}
	plaintext, err := aead.Open(nil, nonce, ciphertext, []byte("omnisight-agent-v1"))
	if err != nil {
		return agentIdentity{}, errors.New("identity decryption failed")
	}
	var identity agentIdentity
	if json.Unmarshal(plaintext, &identity) != nil || identity.AgentID == "" || identity.AgentToken == "" {
		return agentIdentity{}, errors.New("invalid identity content")
	}
	return identity, nil
}

func saveIdentity(path string, key []byte, identity agentIdentity) error {
	if identity.AgentID == "" || identity.AgentToken == "" {
		return errors.New("incomplete identity")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	plaintext, err := json.Marshal(identity)
	if err != nil {
		return err
	}
	data, err := json.Marshal(encryptedIdentity{1, base64.StdEncoding.EncodeToString(nonce), base64.StdEncoding.EncodeToString(aead.Seal(nil, nonce, plaintext, []byte("omnisight-agent-v1")))})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Write(data); err != nil {
		return err
	}
	return file.Sync()
}

func registerAgent(ctx context.Context, endpoint string, fp hostFingerprint, client *http.Client) (agentIdentity, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/api/v1/agent/register" {
		return agentIdentity{}, errors.New("registration endpoint must be HTTPS /api/v1/agent/register")
	}
	body, err := json.Marshal(fp)
	if err != nil {
		return agentIdentity{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return agentIdentity{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if client == nil {
		client = &http.Client{}
	}
	bounded := *client
	if bounded.Timeout == 0 || bounded.Timeout > 10*time.Second {
		bounded.Timeout = 10 * time.Second
	}
	bounded.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := bounded.Do(req)
	if err != nil {
		return agentIdentity{}, fmt.Errorf("registration request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return agentIdentity{}, fmt.Errorf("registration rejected: HTTP %d", resp.StatusCode)
	}
	var identity agentIdentity
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8192)).Decode(&identity); err != nil {
		return agentIdentity{}, errors.New("invalid registration response")
	}
	if strings.TrimSpace(identity.AgentID) == "" || strings.TrimSpace(identity.AgentToken) == "" {
		return agentIdentity{}, errors.New("registration response lacks agent identity")
	}
	return identity, nil
}

func resolveIdentity(ctx context.Context) (agentIdentity, error) {
	if id, token := os.Getenv("OMNISIGHT_AGENT_ID"), os.Getenv("OMNISIGHT_AGENT_SECRET"); id != "" && token != "" {
		return agentIdentity{id, token}, nil
	}
	key, err := identityKey()
	if err != nil {
		return agentIdentity{}, err
	}
	path := identityPath()
	identity, err := loadIdentity(path, key)
	if err == nil {
		return identity, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return agentIdentity{}, err
	}
	endpoint := os.Getenv("OMNISIGHT_REGISTRATION_URL")
	if endpoint == "" {
		return agentIdentity{}, errors.New("OMNISIGHT_REGISTRATION_URL is required")
	}
	fp, err := collectFingerprint(ctx)
	if err != nil {
		return agentIdentity{}, err
	}
	identity, err = registerAgent(ctx, endpoint, fp, nil)
	if err != nil {
		return agentIdentity{}, err
	}
	if err := saveIdentity(path, key, identity); err != nil {
		return agentIdentity{}, fmt.Errorf("save agent identity: %w", err)
	}
	return identity, nil
}
