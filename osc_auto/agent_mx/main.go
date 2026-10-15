// Agen mail-relay (modul MAIL). Status: scaffold (TBD di blueprint).
package main

import "osc_auto/internal/agent"

func main() {
	agent.Run(agent.Default("agent_mx", "mx", []string{"mail"}))
}
