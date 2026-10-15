// Agen per-VM: menjalankan kemampuan POD, NET, OBS, VMS, SEC, PAM, WEB.
package main

import "osc_auto/internal/agent"

func main() {
	agent.Run(agent.Default("agent_vm", "vm", []string{
		"pod", "net", "obs", "vms", "sec", "pam", "web",
	}))
}
