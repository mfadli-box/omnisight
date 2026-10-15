// Agen runner CI/CD untuk modul DSO (build/deploy).
package main

import "osc_auto/internal/agent"

func main() {
	agent.Run(agent.Default("agent_ci", "ci", []string{"dso"}))
}
