package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/host_telemetry_agent/internal/domain"
)

// --- fakes ---------------------------------------------------------------

type fakeSystem struct {
	inv    domain.Inventory
	hst    domain.HostSample
	invErr error
	hstErr error
}

func (f *fakeSystem) CollectInventory(context.Context) (domain.Inventory, error) {
	return f.inv, f.invErr
}
func (f *fakeSystem) CollectHostSample(context.Context) (domain.HostSample, error) {
	return f.hst, f.hstErr
}

type fakeDocker struct {
	containers []domain.ContainerSample
	err        error
}

func (f *fakeDocker) CollectContainers(context.Context) ([]domain.ContainerSample, error) {
	return f.containers, f.err
}

type fakeAPI struct {
	inventories []domain.Inventory
	batches     []domain.MetricsBatch
	secBatches  []domain.SecurityBatch
	invErr      error
	metErr      error
	secErr      error
}

func (f *fakeAPI) Enroll(context.Context, domain.EnrollRequest) (domain.Credentials, error) {
	return domain.Credentials{}, nil
}
func (f *fakeAPI) IngestSecurity(_ context.Context, b domain.SecurityBatch) error {
	if f.secErr != nil {
		return f.secErr
	}
	f.secBatches = append(f.secBatches, b)
	return nil
}
func (f *fakeAPI) IngestInventory(_ context.Context, inv domain.Inventory) error {
	if f.invErr != nil {
		return f.invErr
	}
	f.inventories = append(f.inventories, inv)
	return nil
}
func (f *fakeAPI) IngestMetrics(_ context.Context, b domain.MetricsBatch) error {
	if f.metErr != nil {
		return f.metErr
	}
	f.batches = append(f.batches, b)
	return nil
}

// --- tests ----------------------------------------------------------------

func TestRunOnceSendsMetricsAndFirstInventory(t *testing.T) {
	now := time.Now().UTC()
	sys := &fakeSystem{
		inv: domain.Inventory{CPUModel: "EPYC", CPUCores: 8, Hostname: "h1"},
		hst: domain.HostSample{RecordedAt: now, CPUUsagePct: ptrT(12.5)},
	}
	docker := &fakeDocker{containers: []domain.ContainerSample{
		{HostID: "host-uuid", ContainerRef: "abc123", RecordedAt: now, IsRunning: true},
	}}
	api := &fakeAPI{}

	c := NewCollector(sys, docker, true, time.Hour, nil, 0, api, testLogger())
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if len(api.batches) != 1 {
		t.Fatalf("harus 1 batch metrics, dapat %d", len(api.batches))
	}
	b := api.batches[0]
	if b.Host == nil || b.Host.CPUUsagePct == nil || *b.Host.CPUUsagePct != 12.5 {
		t.Fatalf("host sample tidak terkirim dengan benar: %+v", b.Host)
	}
	if len(b.Containers) != 1 || b.Containers[0].ContainerRef != "abc123" {
		t.Fatalf("containers tidak terkirim dengan benar: %+v", b.Containers)
	}

	if len(api.inventories) != 1 {
		t.Fatalf("siklus pertama harus kirim inventaris, dapat %d", len(api.inventories))
	}
	if api.inventories[0].CPUModel != "EPYC" {
		t.Fatalf("isi inventaris salah: %+v", api.inventories[0])
	}

	// Siklus kedua segera: inventory TIDAK dikirim ulang (interval 1 jam).
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce ke-2: %v", err)
	}
	if len(api.inventories) != 1 {
		t.Fatalf("inventaris tidak boleh dikirim ulang sebelum interval: %d", len(api.inventories))
	}
	if len(api.batches) != 2 {
		t.Fatalf("metrics harus tetap dikirim tiap siklus, dapat %d", len(api.batches))
	}
}

func TestRunOnceCollectErrorsAreNonFatal(t *testing.T) {
	now := time.Now().UTC()
	sys := &fakeSystem{
		hst:    domain.HostSample{RecordedAt: now},
		invErr: errors.New("proc hilang"),
	}
	docker := &fakeDocker{err: errors.New("docker mati")}
	api := &fakeAPI{}

	c := NewCollector(sys, docker, true, time.Hour, nil, 0, api, testLogger())
	err := c.RunOnce(context.Background())
	if err == nil {
		t.Fatal("error kolektor harus dilaporkan")
	}
	// Metrics tetap terkirim (host sample ada meski docker gagal).
	if len(api.batches) != 1 || len(api.batches[0].Containers) != 0 {
		t.Fatalf("batch harus tetap dikirim tanpa containers: %+v", api.batches)
	}
	// Inventory gagal → dikirim ulang di siklus berikutnya (belum ditandai).
	if err := c.RunOnce(context.Background()); err == nil {
		t.Fatal("inventory error berulang harus tetap dilaporkan")
	}
}

func TestRunOnceBatchLimitClamped(t *testing.T) {
	now := time.Now().UTC()
	containers := make([]domain.ContainerSample, maxContainersPerBatch+5)
	for i := range containers {
		containers[i] = domain.ContainerSample{
			HostID: "host-uuid", ContainerRef: "c" + time.Duration(i).String(), RecordedAt: now, IsRunning: true,
		}
	}
	sys := &fakeSystem{hst: domain.HostSample{RecordedAt: now}}
	api := &fakeAPI{}
	c := NewCollector(sys, &fakeDocker{containers: containers}, true, time.Hour, nil, 0, api, testLogger())
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if n := len(api.batches[0].Containers); n != maxContainersPerBatch {
		t.Fatalf("batch harus dipotong ke %d, dapat %d", maxContainersPerBatch, n)
	}
}

func TestRunOnceDisabledDockerSendsNothing(t *testing.T) {
	now := time.Now().UTC()
	sys := &fakeSystem{hst: domain.HostSample{RecordedAt: now}}
	api := &fakeAPI{}
	c := NewCollector(sys, &fakeDocker{containers: []domain.ContainerSample{{HostID: "x", ContainerRef: "y"}}},
		false, time.Hour, nil, 0, api, testLogger())
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if len(api.batches[0].Containers) != 0 {
		t.Fatal("docker dinonaktifkan → containers tidak boleh terkirim")
	}
}

func ptrT(v float64) *float64 { return &v }

// --- FIM tests ------------------------------------------------------------

type fakeFim struct {
	events []domain.FimEvent
	err    error
	calls  int
}

func (f *fakeFim) CollectChanges(context.Context) ([]domain.FimEvent, error) {
	f.calls++
	return f.events, f.err
}

func TestRunOnceIngestsFimEventsFirstCycleOnly(t *testing.T) {
	sys := &fakeSystem{hst: domain.HostSample{RecordedAt: time.Now().UTC()}}
	api := &fakeAPI{}
	fim := &fakeFim{events: []domain.FimEvent{
		{Path: "/etc/passwd", EventType: domain.FimEventModified, DetectionSource: domain.FimSourceScheduled,
			NewChecksum: strings.Repeat("a", 64), DetectedAt: time.Now().UTC()},
		{Path: strings.Repeat("x", 1001), EventType: domain.FimEventModified, NewChecksum: strings.Repeat("b", 64)}, // invalid → dibuang
	}}
	c := NewCollector(sys, nil, false, time.Hour, fim, time.Minute, api, testLogger())
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if len(api.secBatches) != 1 || len(api.secBatches[0].FimEvents) != 1 {
		t.Fatalf("hanya event valid harus terkirim: %+v", api.secBatches)
	}
	if api.secBatches[0].FimEvents[0].Path != "/etc/passwd" {
		t.Fatalf("event salah: %+v", api.secBatches[0].FimEvents[0])
	}

	// Scan kedua segera: interval 1 menit belum jatuh tempo → tidak ada batch baru.
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce ke-2: %v", err)
	}
	if len(api.secBatches) != 1 || fim.calls != 1 {
		t.Fatalf("FIM harus di-skip sebelum interval: batches=%d calls=%d", len(api.secBatches), fim.calls)
	}
}

func TestRunOnceFimTruncatesToContractLimit(t *testing.T) {
	sys := &fakeSystem{hst: domain.HostSample{RecordedAt: time.Now().UTC()}}
	api := &fakeAPI{}
	events := make([]domain.FimEvent, maxFimEventsPerBatch+50)
	for i := range events {
		events[i] = domain.FimEvent{
			Path: "/etc/f" + time.Duration(i).String(), EventType: domain.FimEventCreated,
			NewChecksum: strings.Repeat("c", 64), DetectedAt: time.Now().UTC(),
		}
	}
	c := NewCollector(sys, nil, false, time.Hour, &fakeFim{events: events}, time.Minute, api, testLogger())
	if err := c.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if len(api.secBatches) != 1 || len(api.secBatches[0].FimEvents) != maxFimEventsPerBatch {
		t.Fatalf("batch FIM harus dipotong ke %d, dapat %d", maxFimEventsPerBatch, len(api.secBatches[0].FimEvents))
	}
}

func TestRunOnceFimErrorNonFatal(t *testing.T) {
	sys := &fakeSystem{hst: domain.HostSample{RecordedAt: time.Now().UTC()}}
	api := &fakeAPI{}
	c := NewCollector(sys, nil, false, time.Hour, &fakeFim{err: errors.New("baseline rusak")}, time.Minute, api, testLogger())
	if err := c.RunOnce(context.Background()); err == nil {
		t.Fatal("error FIM harus dilaporkan")
	}
	if len(api.batches) != 1 {
		t.Fatalf("metrics tetap harus terkirim: %d", len(api.batches))
	}
}
