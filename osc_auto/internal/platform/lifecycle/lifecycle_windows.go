//go:build windows

package lifecycle

import (
	"context"
	"errors"
	"sync"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/debug"
)

type Runner interface{ Run(context.Context) error }
type agentService struct{ runner Runner }

func (s *agentService) Execute(_ []string, requests <-chan svc.ChangeRequest, statuses chan<- svc.Status) (bool, uint32) {
	const accepted = svc.AcceptStop | svc.AcceptShutdown
	statuses <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var once sync.Once
	done := make(chan error, 1)
	go func() { done <- s.runner.Run(ctx) }()
	statuses <- svc.Status{State: svc.Running, Accepts: accepted}
	for {
		select {
		case err := <-done:
			if err != nil {
				return true, 1
			}
			statuses <- svc.Status{State: svc.Stopped}
			return false, 0
		case request := <-requests:
			switch request.Cmd {
			case svc.Interrogate:
				statuses <- request.CurrentStatus
			case svc.Stop, svc.Shutdown:
				statuses <- svc.Status{State: svc.StopPending}
				once.Do(cancel)
				err := <-done
				if err != nil && !errors.Is(err, context.Canceled) {
					return true, 1
				}
				statuses <- svc.Status{State: svc.Stopped}
				return false, 0
			}
		}
	}
}
func Run(name string, runner Runner) error {
	service := &agentService{runner: runner}
	if isService, err := svc.IsWindowsService(); err == nil && isService {
		return svc.Run(name, service)
	}
	return debug.Run(name, service)
}
