package config

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type Config struct {
	APIURL          string   `json:"api_url"`
	NodeID          string   `json:"node_id"`
	NodeToken       string   `json:"node_token"`
	JobHMACKey      string   `json:"job_hmac_key_base64"`
	IntervalSeconds int      `json:"interval_seconds"`
	StateDir        string   `json:"state_dir"`
	AllowedServices []string `json:"allowed_services"`
}

var identifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

func Load(path string) (Config, []byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, nil, fmt.Errorf("open agent config: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() > 64<<10 {
		return Config{}, nil, errors.New("agent config exceeds size limit or cannot be inspected")
	}
	decoder := json.NewDecoder(io.LimitReader(file, 64<<10))
	decoder.DisallowUnknownFields()
	var cfg Config
	if err := decoder.Decode(&cfg); err != nil {
		return Config{}, nil, fmt.Errorf("parse agent config: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Config{}, nil, errors.New("agent config contains trailing JSON")
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, nil, err
	}
	key, err := decodeKey(cfg.JobHMACKey)
	if err != nil {
		return Config{}, nil, err
	}
	if !filepath.IsAbs(cfg.StateDir) {
		cfg.StateDir = filepath.Clean(cfg.StateDir)
	}
	return cfg, key, nil
}

func (c Config) Validate() error {
	if err := validateURL(c.APIURL, "api_url"); err != nil {
		return err
	}
	if !identifier.MatchString(c.NodeID) || len(c.NodeToken) < 32 || len(c.NodeToken) > 512 {
		return errors.New("node_id or node_token is invalid")
	}
	if c.IntervalSeconds < 10 || c.IntervalSeconds > 600 {
		return errors.New("interval_seconds must be between 10 and 600")
	}
	if c.StateDir == "" {
		return errors.New("state_dir is required")
	}
	return validateServices(c.AllowedServices)
}

func validateURL(value, name string) error {
	parsed, err := url.ParseRequestURI(value)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || strings.Contains(value, "#") {
		return fmt.Errorf("%s must be an absolute HTTPS URL without user info, query, or fragment", name)
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && isLoopback(parsed.Hostname())) {
		return fmt.Errorf("%s requires HTTPS except for loopback development", name)
	}
	return nil
}

func validateServices(services []string) error {
	if len(services) > 32 {
		return errors.New("allowed_services must contain at most 32 entries")
	}
	seen := map[string]struct{}{}
	for _, service := range services {
		if !identifier.MatchString(service) {
			return fmt.Errorf("allowed service name %q is invalid", service)
		}
		if _, ok := seen[service]; ok {
			return fmt.Errorf("allowed service name %q is duplicated", service)
		}
		seen[service] = struct{}{}
	}
	return nil
}

func decodeKey(value string) ([]byte, error) {
	key, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil {
		key, err = base64.StdEncoding.DecodeString(value)
	}
	if err != nil || len(key) != 32 {
		return nil, errors.New("job_hmac_key_base64 must encode exactly 32 random bytes")
	}
	return key, nil
}

func isLoopback(host string) bool {
	return strings.EqualFold(host, "localhost") || host == "127.0.0.1" || host == "::1"
}

func (c Config) Interval() time.Duration { return time.Duration(c.IntervalSeconds) * time.Second }
