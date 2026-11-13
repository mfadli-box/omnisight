package usecase

import (
	"context"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

// --- fakes ---------------------------------------------------------------

type fakeSource struct{ mf domain.MonitorsFile }

func (f *fakeSource) Load(context.Context) (domain.MonitorsFile, error) { return f.mf, nil }

type fakeProber struct{ results map[string]domain.ProbeResult }

func (f *fakeProber) Probe(_ context.Context, m domain.MonitorConfig) domain.ProbeResult {
	if r, ok := f.results[m.MonitorID]; ok {
		return r
	}
	return domain.ProbeResult{Status: domain.StatusUp}
}

type fakeSnmp struct {
	out map[int]domain.IfCounters
	err error
}

func (f *fakeSnmp) FetchCounters(context.Context, domain.SnmpDevice) (map[int]domain.IfCounters, error) {
	return f.out, f.err
}

type fakeAPI struct {
	heartbeats []domain.HeartbeatPayload
	batches    []domain.MetricsBatch
	hbErr      error
}

func (f *fakeAPI) Enroll(context.Context, domain.EnrollRequest) (domain.Credentials, error) {
	return domain.Credentials{}, nil
}
func (f *fakeAPI) IngestHeartbeat(_ context.Context, hb domain.HeartbeatPayload) error {
	if f.hbErr != nil {
		return f.hbErr
	}
	f.heartbeats = append(f.heartbeats, hb)
	return nil
}
func (f *fakeAPI) IngestMetrics(_ context.Context, b domain.MetricsBatch) error {
	f.batches = append(f.batches, b)
	return nil
}

// --- tests ----------------------------------------------------------------

func TestRunOnceSendsHeartbeatsForAllMonitors(t *testing.T) {
	mf := domain.MonitorsFile{Monitors: []domain.MonitorConfig{
		{MonitorID: "m1", Type: "HTTP", Target: "http://example.com"},
		{MonitorID: "m2", Type: "ICMP", Target: "10.0.0.1"},
	}}
	api := &fakeAPI{}
	p := NewPoller(&fakeSource{mf}, &fakeProber{results: map[string]domain.ProbeResult{
		"m1": {Status: domain.StatusUp, PingMS: int64Ptr(12)},
		"m2": {Status: domain.StatusDown, Msg: "timeout"},
	}}, nil, api, 5*time.Second, testLogger())

	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if len(api.heartbeats) != 2 {
		t.Fatalf("harus 2 heartbeat, dapat %d", len(api.heartbeats))
	}
	if api.heartbeats[0].MonitorID != "m1" || api.heartbeats[0].Status != domain.StatusUp {
		t.Fatalf("heartbeat m1 salah: %+v", api.heartbeats[0])
	}
	if api.heartbeats[1].Status != domain.StatusDown || api.heartbeats[1].Msg == nil {
		t.Fatalf("heartbeat m2 salah: %+v", api.heartbeats[1])
	}
	if len(api.batches) != 0 {
		t.Fatalf("tanpa SNMP tidak boleh kirim metrics batch: %d", len(api.batches))
	}
}

func TestRunOnceSnmpRates(t *testing.T) {
	mf := domain.MonitorsFile{SnmpDevices: []domain.SnmpDevice{{
		Host: "10.0.0.2", Community: "public",
		Interfaces: []domain.SnmpInterface{{InterfaceID: "if-1", IfIndex: 2}},
	}}}
	api := &fakeAPI{}
	counters := map[int]domain.IfCounters{
		2: {InOctets: u64Ptr(1_000_000), OutOctets: u64Ptr(500_000),
			InErrors: u64Ptr(0), OutErrors: u64Ptr(1)},
	}
	p := NewPoller(&fakeSource{mf}, &fakeProber{}, &fakeSnmp{out: counters}, api,
		5*time.Second, testLogger())

	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce #1: %v", err)
	}
	if len(api.batches) != 1 {
		t.Fatalf("harus 1 batch, dapat %d", len(api.batches))
	}
	s := api.batches[0].SnmpInterfaces[0]
	if s.InRateBPS != nil || s.OutRateBPS != nil {
		t.Fatal("sampel pertama tidak boleh punya rate (belum ada prev)")
	}

	// Siklus kedua: counter naik → rate terhitung.
	counters[2] = domain.IfCounters{
		InOctets: u64Ptr(2_000_000), OutOctets: u64Ptr(900_000),
		InErrors: u64Ptr(0), OutErrors: u64Ptr(1),
	}
	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce #2: %v", err)
	}
	s = api.batches[1].SnmpInterfaces[0]
	if s.InRateBPS == nil || s.OutRateBPS == nil {
		t.Fatalf("siklus kedua harus punya rate: %+v", s)
	}
	if s.InOctets != 2_000_000 || s.OutOctets != 900_000 {
		t.Fatalf("counter mentah salah: %+v", s)
	}
}

func TestRunOnceSnmpCounterResetClamped(t *testing.T) {
	mf := domain.MonitorsFile{SnmpDevices: []domain.SnmpDevice{{
		Host: "10.0.0.2", Community: "public",
		Interfaces: []domain.SnmpInterface{{InterfaceID: "if-1", IfIndex: 2}},
	}}}
	api := &fakeAPI{}
	counters := map[int]domain.IfCounters{
		2: {InOctets: u64Ptr(9_999_999), OutOctets: u64Ptr(9_999_999)},
	}
	p := NewPoller(&fakeSource{mf}, &fakeProber{}, &fakeSnmp{out: counters}, api,
		5*time.Second, testLogger())
	_ = p.RunOnce(context.Background())

	// Device reboot → counter reset kecil: rate harus clamp ke 0, bukan negatif.
	counters[2] = domain.IfCounters{InOctets: u64Ptr(100), OutOctets: u64Ptr(50)}
	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce #2: %v", err)
	}
	s := api.batches[1].SnmpInterfaces[0]
	if s.InRateBPS == nil || *s.InRateBPS != 0 || s.OutRateBPS == nil || *s.OutRateBPS != 0 {
		t.Fatalf("counter reset harus menghasilkan rate 0: %+v", s)
	}
}

func TestRunOnceHeartbeatErrorNotFatal(t *testing.T) {
	mf := domain.MonitorsFile{Monitors: []domain.MonitorConfig{
		{MonitorID: "m1", Type: "HTTP", Target: "http://x"},
	}}
	api := &fakeAPI{hbErr: context.DeadlineExceeded}
	p := NewPoller(&fakeSource{mf}, &fakeProber{}, nil, api, 5*time.Second, testLogger())
	if err := p.RunOnce(context.Background()); err == nil {
		t.Fatal("error heartbeat harus dilaporkan")
	}
}

func TestRunOnceEmptyMonitorsFile(t *testing.T) {
	api := &fakeAPI{}
	p := NewPoller(&fakeSource{domain.MonitorsFile{}}, &fakeProber{}, nil, api,
		5*time.Second, testLogger())
	if err := p.RunOnce(context.Background()); err != nil {
		t.Fatalf("file kosong tidak boleh error: %v", err)
	}
	if len(api.heartbeats) != 0 {
		t.Fatal("tidak boleh ada heartbeat")
	}
}

func u64Ptr(v uint64) *uint64 { return &v }
