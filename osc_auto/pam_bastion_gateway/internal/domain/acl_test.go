package domain

import "testing"

func TestACLDenyBlocksBlacklistedCommand(t *testing.T) {
	f := &CommandFilter{Deny: []string{"rm", "shutdown", "re:mkfs", "dd"}}
	cases := []struct {
		line string
		deny bool
	}{
		{"rm -rf /\r", true},
		{"  RM  -rf /", true},
		{"sudo rm -rf /", true},
		{"sudo -i shutdown -h now", true},
		{"/bin/rm -rf /tmp/x", true},
		{"shutdown", true},
		{"mkfs.ext4 /dev/sda1", true},
		{"dd if=/dev/zero of=/dev/sda", true},
		{"echo hello", false},
		{"systemctl restart nginx", false},
		{"ls -la", false},
		{"FOO=bar rm -rf /", true},
		{"rmdir tmpdir", false},
	}
	for _, c := range cases {
		got := f.Evaluate(c.line)
		if c.deny && got.Decision != ACLDeny {
			t.Errorf("%q harus DENY, dapat %s (rule=%q)", c.line, got.Decision, got.Rule)
		}
		if !c.deny && got.Decision != ACLAllow {
			t.Errorf("%q harus ALLOW, dapat %s (rule=%q)", c.line, got.Decision, got.Rule)
		}
	}
}

func TestACLConfirmRequiresApprovalMeansDeny(t *testing.T) {
	f := &CommandFilter{Confirm: []string{"systemctl"}, Deny: []string{"reboot"}}
	if got := f.Evaluate("systemctl stop docker"); got.Decision != ACLDeny {
		t.Fatalf("confirm harus DENY (approval W4 belum ada), dapat %s", got.Decision)
	}
	if got := f.Evaluate("reboot"); got.Decision != ACLDeny || got.Rule != "reboot" {
		t.Fatalf("deny harus menang atas confirm: %+v", got)
	}
}

func TestACLEmptyFilterAllowsAll(t *testing.T) {
	var nilFilter *CommandFilter
	if got := nilFilter.Evaluate("rm -rf /"); got.Decision != ACLAllow {
		t.Fatalf("filter nil → allow, dapat %s", got.Decision)
	}
	empty := &CommandFilter{}
	if got := empty.Evaluate("shutdown"); got.Decision != ACLAllow {
		t.Fatalf("filter kosong → allow, dapat %s", got.Decision)
	}
}

func TestACLMalformedRegexFailsSafeDeny(t *testing.T) {
	f := &CommandFilter{Deny: []string{"re:([unclosed"}}
	if got := f.Evaluate("ls"); got.Decision != ACLDeny {
		t.Fatalf("regex malformed harus fail-safe DENY, dapat %s", got.Decision)
	}
}

func TestACLControlCharsCannotEvadeFilter(t *testing.T) {
	f := &CommandFilter{Deny: []string{"rm"}}
	// \x00 disisipkan antara karakter untuk mengelabui parser.
	if got := f.Evaluate("r\x00m -rf /"); got.Decision != ACLDeny {
		t.Fatalf("control char tidak boleh menyamarkan perintah: %+v", got)
	}
}
