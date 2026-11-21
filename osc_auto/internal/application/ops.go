package application

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"omnisight/osc_auto/internal/domain"
)

type OpsAPI interface {
	ClaimOps(context.Context, bool) (*domain.OpsJob, error)
	OpsOutput(context.Context, string, int, string) error
	OpsDone(context.Context, string, bool) error
}

type ComposeRunner interface {
	Run(context.Context, string, string, domain.OpsInput, func(string) error) error
}

type OpsWorker struct {
	API          OpsAPI
	Compose      ComposeRunner
	Executor     *JobExecutor
	DockerStatus func(context.Context) (string, error)
	Logger       *slog.Logger
}

func (w OpsWorker) Run(ctx context.Context) error {
	return runPeriodic(ctx, 2*time.Second, w.Logger, "ops_poll", func(ctx context.Context) error {
		job, err := w.API.ClaimOps(ctx, w.Compose != nil)
		if err != nil || job == nil {
			return err
		}
		return w.execute(ctx, job)
	})
}

func (w OpsWorker) execute(ctx context.Context, job *domain.OpsJob) error {
	report, cancelReport := context.WithDeadline(ctx, job.ExpiresAt)
	defer cancelReport()
	timeout := 4 * time.Minute
	if job.Action == "terminal" {
		timeout = 20 * time.Second
	}
	ctx, cancel := context.WithDeadline(report, minTime(job.ExpiresAt.Add(-8*time.Second), time.Now().Add(timeout)))
	defer cancel()
	seq := 0
	var deliveryError error
	emit := func(text string) error {
		text = strings.ToValidUTF8(strings.ReplaceAll(text, "\x00", ""), "")
		for len(text) > 0 && seq < 128 {
			size := min(len(text), 4096)
			for size < len(text) && !utf8.RuneStart(text[size]) {
				size--
			}
			if deliveryError != nil {
				return deliveryError
			}
			deliveryError = w.API.OpsOutput(ctx, job.ID, seq+1, text[:size])
			if deliveryError != nil {
				return deliveryError
			}
			seq++
			text = text[size:]
		}
		return nil
	}
	err := ctx.Err()
	if err == nil {
		switch {
		case job.Action == "terminal":
			err = w.terminal(ctx, job.Input, emit)
		case w.Compose != nil:
			err = w.Compose.Run(ctx, job.StackName, job.Action, job.Input, emit)
		default:
			err = errors.New("Compose is disabled on this node")
		}
	}
	if err != nil && deliveryError == nil && seq < 128 {
		// Executor errors contain fixed diagnostics and never include input or child stderr.
		_ = w.API.OpsOutput(report, job.ID, seq+1, err.Error()+"\n")
	}
	return errors.Join(deliveryError, w.API.OpsDone(report, job.ID, err == nil && deliveryError == nil))
}

func (w OpsWorker) terminal(ctx context.Context, input domain.OpsInput, emit func(string) error) error {
	if input.Command == nil || input.Compose != nil || input.Env != nil {
		return errors.New("terminal requires an allowlisted command")
	}
	var output string
	var err error
	switch *input.Command {
	case "docker ps":
		output, err = w.DockerStatus(ctx)
	case "uptime", "df":
		output, err = w.Executor.ExecuteDiagnostic(ctx, domain.Job{Command: *input.Command})
	default:
		return errors.New("command is outside the local terminal allowlist")
	}
	if output != "" {
		if err := emit(output + "\n"); err != nil {
			return err
		}
	}
	if err != nil {
		return errors.New("allowlisted diagnostic failed")
	}
	return nil
}

func minTime(first, second time.Time) time.Time {
	if first.Before(second) {
		return first
	}
	return second
}
