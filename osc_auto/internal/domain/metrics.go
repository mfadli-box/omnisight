package domain

type HostMetrics struct {
	CPUPct      float64         `json:"cpu_pct"`
	RAMUsedMB   float64         `json:"ram_used_mb"`
	RAMTotalMB  float64         `json:"ram_total_mb"`
	Disks       []DiskUsage     `json:"disk_json"`
	DiskIO      []DiskIO        `json:"disk_io_json"`
	Network     []NetworkIO     `json:"net_json"`
	LoadAverage *[3]float64     `json:"load_avg"`
	Temperature *float64        `json:"temp_c"`
	Smart       []SmartHealth   `json:"smart_json"`
	Containers  []ContainerStat `json:"containers_json"`
}

type DiskUsage struct {
	Mount      string `json:"mount"`
	UsedBytes  uint64 `json:"used_bytes"`
	TotalBytes uint64 `json:"total_bytes"`
}

type DiskIO struct {
	Device     string `json:"device"`
	ReadBytes  uint64 `json:"read_bytes"`
	WriteBytes uint64 `json:"write_bytes"`
}

type NetworkIO struct {
	Interface string `json:"interface"`
	RXBytes   uint64 `json:"rx_bytes"`
	TXBytes   uint64 `json:"tx_bytes"`
}

type SmartHealth struct {
	Device string `json:"device"`
	Model  string `json:"model"`
	Passed *bool  `json:"passed"`
}

type ContainerStat struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	CPUPct  float64 `json:"cpu_pct"`
	Memory  string  `json:"memory"`
	Network string  `json:"network"`
	BlockIO string  `json:"block_io"`
}
