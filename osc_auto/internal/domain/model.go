package domain

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

const (
	MaxJobBytes    = 64 << 10
	MaxOutputByte  = 8 << 10
	MaxJobLifetime = 15 * time.Minute
)

var identifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type Telemetry struct {
	NodeID        string    `json:"node_id"`
	Sequence      uint64    `json:"sequence"`
	CollectedAt   time.Time `json:"collected_at"`
	Hostname      string    `json:"hostname"`
	OS            string    `json:"os"`
	OSVersion     string    `json:"os_version"`
	Architecture  string    `json:"architecture"`
	CPUPercent    float64   `json:"cpu_percent"`
	CPUCount      int       `json:"cpu_count"`
	MemoryTotal   uint64    `json:"memory_total_bytes"`
	MemoryUsed    uint64    `json:"memory_used_bytes"`
	DiskTotal     uint64    `json:"disk_total_bytes"`
	DiskUsed      uint64    `json:"disk_used_bytes"`
	UptimeSeconds uint64    `json:"uptime_seconds"`
}

func (t Telemetry) Validate() error {
	if !identifierPattern.MatchString(t.NodeID) || t.Sequence == 0 || t.CollectedAt.IsZero() {
		return errors.New("invalid heartbeat identity")
	}
	if math.IsNaN(t.CPUPercent) || math.IsInf(t.CPUPercent, 0) || t.CPUPercent < 0 || t.CPUPercent > 100 {
		return errors.New("invalid CPU percentage")
	}
	if t.CPUCount < 1 || t.MemoryUsed > t.MemoryTotal || t.DiskUsed > t.DiskTotal || t.Hostname == "" {
		return errors.New("invalid telemetry measurements")
	}
	return nil
}

type JobEnvelope struct {
	Payload   json.RawMessage `json:"payload"`
	Signature string          `json:"signature"`
}

type Job struct {
	JobID     string            `json:"job_id"`
	Nonce     string            `json:"nonce"`
	Audience  string            `json:"audience"`
	IssuedAt  int64             `json:"issued_at"`
	ExpiresAt int64             `json:"expires_at"`
	Command   string            `json:"command"`
	Args      map[string]string `json:"args,omitempty"`
}

func (j Job) Validate(now time.Time, expectedNodeID string) error {
	if !identifierPattern.MatchString(j.JobID) || !identifierPattern.MatchString(j.Nonce) || j.Audience != expectedNodeID {
		return errors.New("job identity or audience invalid")
	}
	issued, expires := time.Unix(j.IssuedAt, 0), time.Unix(j.ExpiresAt, 0)
	if issued.After(now.Add(30*time.Second)) || now.After(expires) || expires.Sub(issued) <= 0 || expires.Sub(issued) > MaxJobLifetime {
		return errors.New("job expired or outside time bounds")
	}
	if j.Command == "" || len(j.Command) > 64 || len(j.Args) > 16 {
		return errors.New("job command or arguments invalid")
	}
	for key, value := range j.Args {
		if len(key) == 0 || len(key) > 64 || len(value) > 512 || strings.ContainsRune(value, '\x00') {
			return fmt.Errorf("job argument %q is invalid", key)
		}
	}
	return nil
}

type JobResult struct {
	NodeID     string    `json:"node_id"`
	JobID      string    `json:"job_id"`
	Nonce      string    `json:"nonce"`
	Status     string    `json:"status"`
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	Output     string    `json:"output,omitempty"`
}

func (r *JobResult) BoundOutput() {
	if len(r.Output) <= MaxOutputByte {
		return
	}
	// Hindari memotong code point UTF-8 pada batas panjang.
	r.Output = strings.ToValidUTF8(r.Output[:MaxOutputByte], "")
}

type Sampler interface {
	Sample(context.Context) (Telemetry, error)
}

type JobRunner interface {
	Run(context.Context, string, map[string]string) (string, error)
}

type ReplayStore interface {
	Consume(string, string, time.Time, time.Time) error
}

type SequenceStore interface{ Next() (uint64, error) }

type ResultQueue interface {
	Enqueue(JobResult) error
	Update(JobResult) error
	Peek() (JobResult, bool, error)
	Remove(string) error
	IsEmpty() (bool, error)
}

type AgentAPI interface {
	Heartbeat(context.Context, Telemetry) error
	Claim(context.Context, string, uint64) (*JobEnvelope, error)
	Report(context.Context, JobResult) error
}
