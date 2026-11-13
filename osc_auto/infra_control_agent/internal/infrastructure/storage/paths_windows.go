//go:build windows

package storage

// defaultStatePath — lokasi state pada Windows (ProgramData, ACL terbatas
// via deploy/windows/install-service.ps1).
func defaultStatePath() string {
	return `C:\ProgramData\infra_control_agent\state.json`
}
