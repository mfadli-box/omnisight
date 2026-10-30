package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
)

const serviceName = "osc_auto"

func main() {
	log.Printf("%s placeholder started", serviceName)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	<-signals
	log.Printf("%s placeholder stopped", serviceName)
}
