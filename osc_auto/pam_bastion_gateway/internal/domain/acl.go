// Command ACL Blacklist — logika domain murni (no I/O).
//
// Semantik (JumpServer-style, subset W3):
//   - deny:    daftar blokir; entri bisa "nama_perintah" (token pertama,
//              exact) atau "re:<regex>" (match regex case-insensitive atas
//              seluruh baris perintah).
//   - confirm: butuh approval (workflow W4) → DENY default (deny-by-default).
//   - allow:   reserved audit; tidak menambah izin (deny tetap menang).
// Filter kosong/NULL → semua perintah diizinkan (behavior policy default).
//
// Pemanggilan real-time: usecase meng-buffer input stdin browser sampai
// newline lalu mengevaluasi baris penuh sebelum diteruskan ke remote.
package domain

import (
	"regexp"
	"strings"
)

// ACLDecision keputusan ACL atas satu baris perintah.
type ACLDecision string

const (
	ACLAllow ACLDecision = "ALLOW"
	ACLDeny  ACLDecision = "DENY"
)

// ACLResult keputusan + rule yang memicu (untuk audit log).
type ACLResult struct {
	Decision ACLDecision
	Rule     string // entri policy yang cocok (kosong = tanpa rule)
	Reason   string // human-readable (deny reason)
}

// CommandFilter memvalidasi baris perintah terhadap policy.
func (f *CommandFilter) Evaluate(line string) ACLResult {
	if f == nil || (len(f.Deny) == 0 && len(f.Confirm) == 0) {
		return ACLResult{Decision: ACLAllow}
	}
	line = strings.TrimSpace(stripControl(line))
	if line == "" {
		return ACLResult{Decision: ACLAllow}
	}

	// confirm → butuh approval W4; deny-by-default aman.
	for _, rule := range f.Confirm {
		if aclRuleMatches(rule, line) {
			return ACLResult{Decision: ACLDeny, Rule: rule,
				Reason: "perintah membutuhkan approval (workflow belum tersedia)"}
		}
	}
	for _, rule := range f.Deny {
		if aclRuleMatches(rule, line) {
			return ACLResult{Decision: ACLDeny, Rule: rule, Reason: "perintah masuk blacklist"}
		}
	}
	return ACLResult{Decision: ACLAllow}
}

// aclRuleMatches — entri "re:<regex>" = regex atas baris penuh; selain itu
// match token perintah pertama (setelah strip env/sudo, basename saja).
func aclRuleMatches(rule, line string) bool {
	rule = strings.TrimSpace(strings.ToLower(rule))
	if rule == "" {
		return false
	}
	if re, ok := strings.CutPrefix(rule, "re:"); ok {
		compiled, err := regexp.Compile("(?i)" + re)
		if err != nil {
			// Entri policy malformed → deny (fail-safe), konsisten dengan
			// prinsip CIDR parser W3: entri rusak = tolak.
			return true
		}
		return compiled.MatchString(line)
	}
	word := commandWord(line)
	return word == baseCommand(rule)
}

// commandWord mengekstrak token perintah efektif: buang rantai env
// ("FOO=bar"), prefix sudo/-E/-i, dan path (basename saja).
func commandWord(line string) string {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return ""
	}
	i := 0
	skipPrefix := func() bool {
		f := strings.ToLower(fields[i])
		switch {
		case strings.Contains(f, "=") && !strings.ContainsAny(f, "\"'"):
			return true // VAR=val
		case f == "sudo" || f == "doas" || f == "-e" || f == "-i" || f == "-s":
			return true
		}
		return false
	}
	for i < len(fields) && skipPrefix() {
		i++
	}
	if i >= len(fields) {
		return ""
	}
	return baseCommand(fields[i])
}

// baseCommand — basename (buang path) + strip argumen.
func baseCommand(tok string) string {
	tok = strings.ToLower(tok)
	if idx := strings.LastIndexAny(tok, `/\\`); idx >= 0 {
		tok = tok[idx+1:]
	}
	return tok
}

// stripControl membuang karakter kontrol & escape ANSI agar tidak
// menyamarkan perintah (anti filter evasion via \x00/ANSI).
func stripControl(line string) string {
	var b strings.Builder
	b.Grow(len(line))
	for _, r := range line {
		if r < 0x20 && r != '\t' {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
