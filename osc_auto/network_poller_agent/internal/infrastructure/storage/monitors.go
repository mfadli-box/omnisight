// ConfigSource — pembaca file konfigurasi monitoring (JSON, 0600).
package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

// MonitorSource implementasi domain.ConfigSource.
type MonitorSource struct {
	path string
}

// NewMonitorSource membangun sumber konfigurasi dari path file.
func NewMonitorSource(path string) *MonitorSource {
	return &MonitorSource{path: path}
}

// Load membaca MonitorsFile; file tidak ada → domain.ErrNotFound.
func (s *MonitorSource) Load(_ context.Context) (domain.MonitorsFile, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return domain.MonitorsFile{}, fmt.Errorf("%s: %w", s.path, domain.ErrNotFound)
		}
		return domain.MonitorsFile{}, fmt.Errorf("membaca monitors file: %w", err)
	}
	var mf domain.MonitorsFile
	if err := json.Unmarshal(raw, &mf); err != nil {
		return domain.MonitorsFile{}, fmt.Errorf("monitors file tidak valid: %w", err)
	}
	// Validasi minimal: monitor wajib punya id + target; SNMP device wajib host.
	var valid []domain.MonitorConfig
	for _, m := range mf.Monitors {
		if m.MonitorID == "" || m.Target == "" || m.Type == "" {
			continue
		}
		if m.Type == domain.MonitorKeyword && m.Keyword == "" {
			continue // KEYWORD tanpa keyword tidak valid → dilewati
		}
		valid = append(valid, m)
	}
	mf.Monitors = valid
	var devs []domain.SnmpDevice
	for _, d := range mf.SnmpDevices {
		if d.Host == "" || len(d.Interfaces) == 0 {
			continue
		}
		devs = append(devs, d)
	}
	mf.SnmpDevices = devs
	if mf.Monitors == nil && mf.SnmpDevices == nil {
		return domain.MonitorsFile{}, errors.New("monitors file tidak berisi konfigurasi valid")
	}
	return mf, nil
}
