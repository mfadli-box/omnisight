package config

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"gopkg.in/yaml.v3"
)

const DefaultPath = "agent.yaml"

var nodeUUID = regexp.MustCompile(`^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$`)

type HeartbeatConfig struct {
	HubURL           string   `yaml:"hub_url"`
	NodeID           string   `yaml:"node_id"`
	AgentSecret      string   `yaml:"agent_secret"`
	PollIntervalSec  int      `yaml:"poll_interval_sec"`
	TelemetryEnabled bool     `yaml:"telemetry_enabled"`
	AllowedServices  []string `yaml:"allowed_services"`
}

func LoadHeartbeat(path string) (HeartbeatConfig, error) {
	cfg := HeartbeatConfig{PollIntervalSec: 30}
	file, err := os.Open(path)
	switch {
	case err == nil:
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, (64<<10)+1))
		if err != nil || len(data) > 64<<10 {
			return HeartbeatConfig{}, errors.New("agent config exceeds size limit or cannot be read")
		}
		decoder := yaml.NewDecoder(bytes.NewReader(data))
		decoder.KnownFields(true)
		if err := decoder.Decode(&cfg); err != nil && !errors.Is(err, io.EOF) {
			return HeartbeatConfig{}, errors.New("invalid agent YAML configuration")
		}
		var trailing any
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			return HeartbeatConfig{}, errors.New("agent config must contain one YAML document")
		}
	case !errors.Is(err, os.ErrNotExist) || path != DefaultPath:
		return HeartbeatConfig{}, err
	}

	for name, target := range map[string]*string{
		"HUB_URL": &cfg.HubURL, "NODE_ID": &cfg.NodeID, "AGENT_SECRET": &cfg.AgentSecret,
	} {
		if value, ok := os.LookupEnv(name); ok {
			*target = value
		}
	}
	if value, ok := os.LookupEnv("POLL_INTERVAL_SEC"); ok {
		cfg.PollIntervalSec, err = strconv.Atoi(value)
		if err != nil {
			return HeartbeatConfig{}, errors.New("POLL_INTERVAL_SEC must be an integer")
		}
	}
	if value, ok := os.LookupEnv("TELEMETRY_ENABLED"); ok {
		cfg.TelemetryEnabled, err = strconv.ParseBool(value)
		if err != nil {
			return HeartbeatConfig{}, errors.New("TELEMETRY_ENABLED must be a boolean")
		}
	}
	if cfg.TelemetryEnabled && !nodeUUID.MatchString(cfg.NodeID) {
		return HeartbeatConfig{}, errors.New("telemetry requires a canonical lowercase node UUID")
	}
	if err := validateURL(cfg.HubURL, "hub_url"); err != nil {
		return HeartbeatConfig{}, err
	}
	if !identifier.MatchString(cfg.NodeID) {
		return HeartbeatConfig{}, errors.New("node_id is invalid")
	}
	if len(cfg.AgentSecret) < 32 || len(cfg.AgentSecret) > 512 || !utf8.ValidString(cfg.AgentSecret) {
		return HeartbeatConfig{}, errors.New("agent_secret must contain 32 to 512 UTF-8 bytes")
	}
	if cfg.PollIntervalSec < 1 || cfg.PollIntervalSec > 600 {
		return HeartbeatConfig{}, errors.New("poll_interval_sec must be between 1 and 600")
	}
	if err := validateServices(cfg.AllowedServices); err != nil {
		return HeartbeatConfig{}, err
	}
	return cfg, nil
}

func (c HeartbeatConfig) Interval() time.Duration {
	return time.Duration(c.PollIntervalSec) * time.Second
}

func IsLegacy(path string) bool { return strings.EqualFold(filepath.Ext(path), ".json") }
