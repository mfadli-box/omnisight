package main

import "testing"

func TestServiceName(t *testing.T) {
	if serviceName != "osc_auto" {
		t.Fatalf("serviceName = %q, want osc_auto", serviceName)
	}
}
