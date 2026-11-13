// SNMPCounterClient — implementasi port domain.SNMPClient: memetakan OID
// ifTable/ifXTable ke counter interface (kontrak MetricsPayload.snmp_interfaces).
package probes

import (
	"context"
	"log/slog"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/infrastructure/snmp"
)

// OIDs ifTable (MIB-2, 1.3.6.1.2.1.2.2.1.x) & ifXTable 64-bit
// (1.3.6.1.2.1.31.1.1.1.x). Kolom yang dipakai agent:
//
//	ifInOctets(.10) / ifOutOctets(.14)          — 32-bit (fallback)
//	ifHCInOctets(31.1.1.6) / ifHCOutOctets(.10) — 64-bit (utama)
//	ifInDiscards(.13), ifInErrors(.14 — ifTable),
//	ifOutDiscards(.19), ifOutErrors(.20)
const (
	oidInOctets    = "1.3.6.1.2.1.2.2.1.10"
	oidOutOctets   = "1.3.6.1.2.1.2.2.1.14"
	oidInDiscards  = "1.3.6.1.2.1.2.2.1.13"
	oidOutDiscards = "1.3.6.1.2.1.2.2.1.19"
	oidInErrors    = "1.3.6.1.2.1.2.2.1.14"
	oidOutErrors   = "1.3.6.1.2.1.2.2.1.20"
	oidHCInOctets  = "1.3.6.1.2.1.31.1.1.1.6"
	oidHCOutOctets = "1.3.6.1.2.1.31.1.1.1.10"
)

// CounterPoller implementasi domain.SNMPClient.
type CounterPoller struct {
	snmp   *snmp.Client
	logger *slog.Logger
}

// NewCounterPoller membangun poller dengan timeout SNMP per request.
func NewCounterPoller(timeout time.Duration, logger *slog.Logger) *CounterPoller {
	return &CounterPoller{snmp: snmp.New(timeout), logger: logger}
}

// FetchCounters mengambil counter untuk tiap if_index yang dipetakan.
// ifHC* (64-bit) diprioritaskan; bila gagal fallback ifOctets 32-bit.
func (cp *CounterPoller) FetchCounters(ctx context.Context, dev domain.SnmpDevice) (map[int]domain.IfCounters, error) {
	// Susun daftar OID unik: untuk tiap index — HC dulu, fallback 32-bit.
	var oidList [][]int
	var plans []oidPlan
	seen := make(map[string]bool)

	addOID := func(base string, idx int, slot func(*domain.IfCounters) **uint64) {
		full := base + "." + itoa(idx)
		if seen[full] {
			return
		}
		seen[full] = true
		oidList = append(oidList, parseOIDString(full))
		plans = append(plans, oidPlan{base: base, idx: idx, full: full, slot: slot})
	}

	for _, itf := range dev.Interfaces {
		idx := itf.IfIndex
		addOID(oidHCInOctets, idx, func(c *domain.IfCounters) **uint64 { return &c.InOctets })
		addOID(oidHCOutOctets, idx, func(c *domain.IfCounters) **uint64 { return &c.OutOctets })
		addOID(oidInOctets, idx, func(c *domain.IfCounters) **uint64 { return &c.InOctets })
		addOID(oidOutOctets, idx, func(c *domain.IfCounters) **uint64 { return &c.OutOctets })
		addOID(oidInErrors, idx, func(c *domain.IfCounters) **uint64 { return &c.InErrors })
		addOID(oidOutErrors, idx, func(c *domain.IfCounters) **uint64 { return &c.OutErrors })
		addOID(oidInDiscards, idx, func(c *domain.IfCounters) **uint64 { return &c.InDiscards })
		addOID(oidOutDiscards, idx, func(c *domain.IfCounters) **uint64 { return &c.OutDiscards })
	}

	if len(oidList) == 0 {
		return map[int]domain.IfCounters{}, nil
	}

	vbs, err := cp.snmp.Get(ctx, dev.Host, dev.Community, oidList)
	if err != nil {
		return nil, err
	}

	// Peta hasil: OID string → value.
	resp := make(map[string]snmp.VarBind, len(vbs))
	for _, vb := range vbs {
		resp[joinOID(vb.OID)] = vb
	}

	counters := make(map[int]domain.IfCounters, len(dev.Interfaces))
	for _, itf := range dev.Interfaces {
		c := domain.IfCounters{}
		counters[itf.IfIndex] = c
	}

	// slot return nil-safe: isi sesuai urutan preferensi (HC dulu, 32-bit
	// hanya bila slot masih kosong).
	for _, plan := range plans {
		vb, ok := resp[plan.full]
		if !ok {
			continue
		}
		c := counters[plan.idx]
		slot := plan.slot(&c)
		if slot == nil || *slot != nil {
			continue // sudah terisi oleh HC
		}
		v, err := vb.Uint()
		if err != nil {
			continue // nilai non-counter (NoSuchObject dst) → skip
		}
		*slot = &v
		counters[plan.idx] = c
	}
	return counters, nil
}

// oidPlan — keterkaitan OID lengkap → slot counter per if_index.
type oidPlan struct {
	base string
	idx  int
	full string
	slot func(*domain.IfCounters) **uint64
}

// parseOIDString — "1.3.6.1…" → []int.
func parseOIDString(s string) []int {
	out := make([]int, 0, 16)
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == '.' {
			if i > start {
				out = append(out, atoi(s[start:i]))
			}
			start = i + 1
		}
	}
	return out
}

func atoi(s string) int {
	v := 0
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0
		}
		v = v*10 + int(s[i]-'0')
	}
	return v
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	var buf [12]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}

// joinOID — []int → "1.3.6…".
func joinOID(oid []int) string {
	out := ""
	for i, v := range oid {
		if i > 0 {
			out += "."
		}
		out += itoa(v)
	}
	return out
}
