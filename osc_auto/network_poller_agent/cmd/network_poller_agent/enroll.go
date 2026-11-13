package main

import (
	"github.com/mfadli-box/omnisight/osc_auto/network_poller_agent/internal/domain"
)

// domainEnrollRequest membangun payload enroll (menjaga main tetap ringkas).
func domainEnrollRequest(token, hostname, mgmtIP, assetModel, statusLabel, assetTag string) domain.EnrollRequest {
	return domain.EnrollRequest{
		EnrollmentToken: token,
		Hostname:        hostname,
		MgmtIP:          mgmtIP,
		AssetModelID:    assetModel,
		StatusLabelID:   statusLabel,
		AssetTag:        assetTag,
		AgentVersion:    version,
	}
}
