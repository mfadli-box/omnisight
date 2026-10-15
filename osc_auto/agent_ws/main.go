// Agen web-server (modul WEB/WAF front-end). Status: scaffold (TBD di blueprint).
package main

import "osc_auto/internal/agent"

func main() {
	agent.Run(agent.Default("agent_ws", "ws", []string{"web", "waf"}))
}
