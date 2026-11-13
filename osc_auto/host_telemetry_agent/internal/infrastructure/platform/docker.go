// Collector statistik container Docker Engine API — logika request/parsing
// bebas build tag; dialer (unix socket / named pipe) per-OS di
// docker_linux.go & docker_windows.go.
package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
)

const (
	// dockerStatsLimit membatasi body respons stats (anti memory-bomb).
	dockerStatsLimit = 8 << 20 // 8 MiB
	// maxContainersPerBatch — batas server kontrak (400 bila lebih).
	maxContainersPerBatch = 200
	// dockerStatsTimeout batas total per request stats.
	dockerStatsTimeout = 8 * time.Second
)

// DockerCollector implementasi port domain.DockerStatsCollector.
type DockerCollector struct {
	logger *slog.Logger
	http   *http.Client
	hostID string // uuid docker_hosts (wajib milik company agent)

	mu   sync.Mutex
	prev map[string]netRateState // container id → counter sebelumnya
}

// netRateState — counter jaringan & blkio snapshot sebelumnya.
type netRateState struct {
	rx, tx     uint64
	readBytes  uint64
	writeBytes uint64
	at         time.Time
}

// NewDockerCollector membangun collector Engine API. hostID kosong berarti
// collector dibuat tetapi CollectContainers selalu mengembalikan nil
// (container metrics membutuhkan host_id docker_hosts yang valid).
func NewDockerCollector(socketPath string, hostID string, logger *slog.Logger) *DockerCollector {
	return &DockerCollector{
		logger: logger,
		http: &http.Client{
			Transport: &http.Transport{DialContext: dockerDialContext(socketPath)},
			Timeout:   dockerStatsTimeout,
		},
		hostID: hostID,
		prev:   make(map[string]netRateState),
	}
}

// Enabled melaporkan apakah collector aktif (host_id terkonfigurasi).
func (c *DockerCollector) Enabled() bool { return c.hostID != "" }

// dockerListResp — subset /containers/json.
type dockerListResp struct {
	ID    string   `json:"Id"`
	Names []string `json:"Names"`
	State string   `json:"State"`
}

// dockerStatsResp — subset /containers/{id}/stats?stream=false.
type dockerStatsResp struct {
	Name     string `json:"name"`
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	} `json:"networks"`
	BlkioStats struct {
		IoServiceBytesRecursive []struct {
			Op    string `json:"op"`
			Value uint64 `json:"value"`
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
	PidsStats struct {
		Current uint64 `json:"current"`
	} `json:"pids_stats"`
}

// CollectContainers mengumpulkan stats semua container berjalan.
func (c *DockerCollector) CollectContainers(ctx context.Context) ([]domain.ContainerSample, error) {
	if !c.Enabled() {
		// host_id tidak dikonfigurasi — metrics container dilewati (bukan error).
		return nil, nil
	}

	list, err := c.listContainers(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: daftar container: %v", domain.ErrUnavailable, err)
	}

	now := time.Now().UTC()
	samples := make([]domain.ContainerSample, 0, len(list))
	for _, ctr := range list {
		if len(samples) >= maxContainersPerBatch {
			c.logger.Warn("batas batch container tercapai; sisanya dilewati",
				"limit", maxContainersPerBatch)
			break
		}
		st, err := c.fetchStats(ctx, ctr.ID)
		if err != nil {
			c.logger.Warn("stats container gagal (dilewati)",
				"container_ref", ctr.ID[:12], "err", err.Error())
			continue
		}
		samples = append(samples, c.toSample(ctr, st, now))
	}
	return samples, nil
}

// listContainers memanggil GET /containers/json (hanya yang running).
func (c *DockerCollector) listContainers(ctx context.Context) ([]dockerListResp, error) {
	var list []dockerListResp
	if err := c.dockerRequest(ctx, "/containers/json?filters=%7B%22status%22%3A%5B%22running%22%5D%7D", &list); err != nil {
		return nil, err
	}
	return list, nil
}

// fetchStats memanggil GET /containers/{id}/stats?stream=false (one-shot).
func (c *DockerCollector) fetchStats(ctx context.Context, id string) (*dockerStatsResp, error) {
	var st dockerStatsResp
	if err := c.dockerRequest(ctx, "/containers/"+id+"/stats?stream=false", &st); err != nil {
		return nil, err
	}
	return &st, nil
}

// dockerRequest request JSON Engine API dengan LimitReader.
func (c *DockerCollector) dockerRequest(ctx context.Context, path string, out any) error {
	reqCtx, cancel := context.WithTimeout(ctx, dockerStatsTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, "http://localhost"+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("docker engine HTTP %d: %s", resp.StatusCode, string(body))
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, dockerStatsLimit))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, out)
}

// toSample memetakan stats Engine API → domain.ContainerSample dengan
// rate (Bps) dihitung delta terhadap snapshot sebelumnya.
func (c *DockerCollector) toSample(ctr dockerListResp, st *dockerStatsResp, now time.Time) domain.ContainerSample {
	sample := domain.ContainerSample{
		HostID:       c.hostID,
		ContainerRef: ctr.ID,
		RecordedAt:   now,
		IsRunning:    strings.EqualFold(ctr.State, "running"),
	}
	if len(ctr.Names) > 0 {
		name := strings.TrimPrefix(ctr.Names[0], "/")
		sample.ContainerName = &name
	}

	// CPU %: (cpu_delta / system_delta) × online_cpus × 100.
	cpuDelta := int64(st.CPUStats.CPUUsage.TotalUsage - st.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := int64(st.CPUStats.SystemCPUUsage - st.PreCPUStats.SystemCPUUsage)
	if sysDelta > 0 && cpuDelta >= 0 {
		online := st.CPUStats.OnlineCPUs
		if online == 0 {
			online = 1
		}
		pct := float64(cpuDelta) / float64(sysDelta) * float64(online) * 100
		sample.CPUUsagePct = &pct
	}

	// Memori: usage − stats.cache (Linux cgroup v1; v2 tak punya cache key).
	memUsed := int64(st.MemoryStats.Usage)
	if cache, ok := st.MemoryStats.Stats["cache"]; ok && int64(cache) <= memUsed {
		memUsed -= int64(cache)
	}
	if memUsed >= 0 {
		sample.MemUsedBytes = &memUsed
	}
	if st.MemoryStats.Limit > 0 {
		limit := int64(st.MemoryStats.Limit)
		sample.MemLimitBytes = &limit
	}

	// PIDs.
	if st.PidsStats.Current > 0 {
		pids := int64(st.PidsStats.Current)
		sample.Pids = &pids
	}

	// Rate jaringan & block IO (delta snapshot sebelumnya).
	var rx, tx, readB, writeB uint64
	for _, n := range st.Networks {
		rx += n.RxBytes
		tx += n.TxBytes
	}
	for _, e := range st.BlkioStats.IoServiceBytesRecursive {
		switch e.Op {
		case "Read":
			readB += e.Value
		case "Write":
			writeB += e.Value
		}
	}

	c.mu.Lock()
	prev, hasPrev := c.prev[ctr.ID]
	c.prev[ctr.ID] = netRateState{rx: rx, tx: tx, readBytes: readB, writeBytes: writeB, at: now}
	c.mu.Unlock()

	if hasPrev {
		elapsed := now.Sub(prev.at).Seconds()
		if elapsed > 0 {
			inBps := ratePerSec(rx, prev.rx, elapsed)
			outBps := ratePerSec(tx, prev.tx, elapsed)
			rBps := ratePerSec(readB, prev.readBytes, elapsed)
			wBps := ratePerSec(writeB, prev.writeBytes, elapsed)
			sample.NetInBPS, sample.NetOutBPS = &inBps, &outBps
			sample.BlockReadBPS, sample.BlockWriteBPS = &rBps, &wBps
		}
	}
	return sample
}

// ratePerSec — delta counter clamp ≥ 0 dibagi elapsed.
func ratePerSec(cur, prev uint64, elapsed float64) int64 {
	if cur < prev {
		return 0 // counter reset (container restart)
	}
	return int64(float64(cur-prev) / elapsed)
}
