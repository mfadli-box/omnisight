package domain

import "time"

type OpsInput struct {
	Compose *string `json:"compose"`
	Env     *string `json:"env"`
	Command *string `json:"command"`
}

type OpsJob struct {
	ID        string    `json:"id"`
	NodeID    string    `json:"node_id"`
	Nonce     string    `json:"nonce"`
	Action    string    `json:"action"`
	StackName string    `json:"stack_name"`
	Input     OpsInput  `json:"input"`
	ExpiresAt time.Time `json:"expires_at"`
}
