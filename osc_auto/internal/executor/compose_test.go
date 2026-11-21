package executor

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"omnisight/osc_auto/internal/domain"
)

func TestComposeAllowsOnlyContainerScopedConfiguration(t *testing.T) {
	valid := "services:\n  app:\n    image: nginx:alpine\n    volumes: [cache:/cache]\nvolumes:\n  cache: {}\n"
	if err := validateCompose(valid); err != nil {
		t.Fatal(err)
	}
	cases := []string{
		"services:\n  app:\n    image: nginx\n    privileged: true\n",
		"services:\n  app:\n    image: nginx\n    env_file: /etc/passwd\n",
		"services:\n  app:\n    image: nginx\n    volumes: [/var/run/docker.sock:/var/run/docker.sock]\n",
		"services:\n  app:\n    image: nginx\n    volumes: [data:/work]\nvolumes:\n  data:\n    driver_opts: {device: /}\n",
		"services:\n  app:\n    image: nginx\ninclude: [/tmp/compose.yaml]\n",
		"services:\n  app:\n    image: nginx\n    image: alpine\n",
		"services:\n  app:\n    image: ${IMAGE}\n",
	}
	for _, content := range cases {
		if validateCompose(content) == nil {
			t.Errorf("unsafe Compose manifest was accepted: %q", content)
		}
	}
	for _, content := range []string{"COMPOSE_FILE=test.yml", "docker_host=other", "SECRET='unclosed\nNEXT=1"} {
		if validateEnv(content) == nil {
			t.Errorf("invalid env was accepted: %q", content)
		}
	}
}

func TestConvertDockerRunWithoutExecuting(t *testing.T) {
	executor := Compose{Root: t.TempDir()}
	command := "docker run -d --name web -p 8080:80 -e 'TITLE=two words' -v cache:/cache nginx:alpine"
	var result string
	err := executor.Run(t.Context(), "web", "convert", domain.OpsInput{Command: &command}, func(yaml string) error {
		result = yaml
		return nil
	})
	if err != nil || !strings.Contains(result, "TITLE=two words") || !strings.Contains(result, "cache:/cache") {
		t.Fatalf("unexpected conversion: %v, %s", err, result)
	}
	if err := validateCompose(result); err != nil {
		t.Fatal(err)
	}
	command = "docker run --privileged alpine"
	if err := executor.Run(t.Context(), "web", "convert", domain.OpsInput{Command: &command}, func(string) error {
		t.Fatal("unsupported flag was converted")
		return nil
	}); err == nil {
		t.Fatal("unsupported flag was accepted")
	}
}

func TestSaveAndReadUsingLocalComposeCLI(t *testing.T) {
	if runtime.GOOS != "linux" || exec.Command("/usr/bin/docker", "compose", "version").Run() != nil {
		t.Skip("local Docker Compose CLI is unavailable")
	}
	executor := Compose{Root: t.TempDir()}
	compose := "services:\n  web:\n    image: nginx:alpine\n    environment:\n      TITLE: ${TITLE:?TITLE required}\n"
	env := "TITLE='two words'\n"
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancel()
	emit := func(string) error { return nil }
	if err := executor.Run(ctx, "web", "save", domain.OpsInput{Compose: &compose, Env: &env}, emit); err != nil {
		t.Fatal(err)
	}
	var host string
	if err := executor.Run(ctx, "web", "read", domain.OpsInput{}, func(output string) error {
		host = output
		return nil
	}); err != nil || host != compose {
		t.Fatalf("unexpected read: %v, %q", err, host)
	}
	badEnv := "OTHER=value\n"
	if err := executor.Run(ctx, "web", "save", domain.OpsInput{Compose: &compose, Env: &badEnv}, emit); err == nil {
		t.Fatal("staged files failed interpolation and were accepted")
	}
	entries, err := os.ReadDir(filepath.Join(executor.Root, "web"))
	if err != nil || len(entries) != 2 || entries[0].Name() != ".env" || entries[1].Name() != "compose.yaml" {
		t.Fatalf("unexpected stack directory: %v, %v", err, entries)
	}
	envFile := filepath.Join(executor.Root, "web", ".env")
	data, err := os.ReadFile(envFile)
	if err != nil || string(data) != env {
		t.Fatalf("previous .env changed on validation failure: %v", err)
	}
	if info, err := os.Stat(envFile); err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf(".env must have owner-only permissions: %v", err)
	}
}
