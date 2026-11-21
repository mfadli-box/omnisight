package executor

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"gopkg.in/yaml.v3"

	"omnisight/osc_auto/internal/domain"
)

const maxCompose = 64 << 10
const maxEnv = 16 << 10

var (
	stackName   = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,62}$`)
	serviceName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)
	imageName   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9./_:@-]{0,511}$`)
	namedMount  = regexp.MustCompile(`^([a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}):(/[a-zA-Z0-9_./-]*)(?::(ro|rw))?$`)
	envKey      = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	portMapping = regexp.MustCompile(`^[0-9.:\[\]a-fA-F-]+(/(tcp|udp|sctp))?$`)
)

type Compose struct {
	Root string
}

func (c Compose) Run(ctx context.Context, name, action string, input domain.OpsInput, emit func(string) error) error {
	if !stackName.MatchString(name) || c.Root == "" {
		return errors.New("stack name or local stack directory is invalid")
	}
	switch action {
	case "convert":
		return convert(input, emit)
	case "read", "save", "up", "down", "pull", "restart":
	default:
		return errors.New("action is outside the local Compose allowlist")
	}
	root, err := os.OpenRoot(c.Root)
	if err != nil {
		return errors.New("local stack directory is unavailable")
	}
	defer root.Close()
	if action == "save" {
		if err := root.Mkdir(name, 0700); err != nil && !errors.Is(err, os.ErrExist) {
			return errors.New("could not create stack directory")
		}
	}
	info, err := root.Lstat(name)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("stack directory is missing or invalid")
	}
	dir, err := root.OpenRoot(name)
	if err != nil {
		return errors.New("could not open stack directory")
	}
	defer dir.Close()

	if action == "save" {
		return c.save(ctx, dir, name, input)
	}
	content, err := readFile(dir, "compose.yaml", maxCompose)
	if err != nil || !utf8.Valid(content) || bytes.IndexByte(content, 0) >= 0 {
		return errors.New("compose.yaml is missing, unreadable, or too large")
	}
	if action == "read" {
		return emit(string(content))
	}
	if err := validateCompose(string(content)); err != nil {
		return err
	}
	envFile, _, err := currentEnv(dir, true)
	if err != nil {
		return err
	}

	args := []string{action}
	if action == "up" {
		args = append(args, "--detach")
	}
	cmd := c.command(ctx, name, "compose.yaml", envFile, args...)
	output := &progress{emit: emit}
	cmd.Stdout, cmd.Stderr = output, output
	runErr := cmd.Run()
	if len(output.line) != 0 {
		output.publishLine()
	}
	if output.err != nil {
		return output.err
	}
	if runErr != nil {
		return errors.New("Docker Compose action failed")
	}
	return nil
}

func (c Compose) save(ctx context.Context, dir *os.Root, name string, input domain.OpsInput) error {
	if input.Compose == nil || input.Command != nil {
		return errors.New("save requires compose.yaml")
	}
	if err := validateCompose(*input.Compose); err != nil {
		return err
	}
	if _, err := readFile(dir, "compose.yaml", maxCompose); err != nil && !errors.Is(err, os.ErrNotExist) {
		return errors.New("existing compose.yaml cannot be replaced")
	}
	envFile, previousEnv, err := currentEnv(dir, input.Env == nil)
	if err != nil {
		return err
	}
	previousEnvFile := envFile
	if input.Env != nil {
		if err := validateEnv(*input.Env); err != nil {
			return err
		}
		envFile, err = tempFile(dir, *input.Env)
		if err != nil {
			return errors.New("could not stage .env")
		}
		defer dir.Remove(envFile)
	}
	composeFile, err := tempFile(dir, *input.Compose)
	if err != nil {
		return errors.New("could not stage compose.yaml")
	}
	defer dir.Remove(composeFile)

	if err := c.command(ctx, name, composeFile, envFile, "config", "--quiet").Run(); err != nil {
		return errors.New("Docker Compose could not validate the files")
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if input.Env != nil {
		if err := dir.Rename(envFile, ".env"); err != nil {
			return errors.New("could not replace .env")
		}
	}
	if err := dir.Rename(composeFile, "compose.yaml"); err != nil {
		if input.Env != nil {
			if err := restoreEnv(dir, previousEnvFile, previousEnv); err != nil {
				return errors.New("could not restore .env after compose.yaml write failed")
			}
		}
		return errors.New("could not replace compose.yaml")
	}
	return nil
}

func restoreEnv(dir *os.Root, previousFile string, previous []byte) error {
	if previousFile == os.DevNull {
		return dir.Remove(".env")
	}
	staged, err := tempFile(dir, string(previous))
	if err != nil {
		return err
	}
	defer dir.Remove(staged)
	return dir.Rename(staged, ".env")
}

func (c Compose) command(ctx context.Context, name, configFile, envFile string, args ...string) *exec.Cmd {
	path := filepath.Join(c.Root, name)
	flags := []string{"compose", "--ansi", "never", "--progress", "plain",
		"--project-directory", path, "--project-name", name, "--file", configFile}
	// Compose expects a regular env file. A missing .env is already checked locally.
	if envFile != os.DevNull {
		flags = append(flags, "--env-file", envFile)
	}
	cmd := docker(ctx, append(flags, args...)...)
	cmd.Dir = path
	cmd.Env = append(cmd.Env, "COMPOSE_DISABLE_ENV_FILE=1")
	return cmd
}

func docker(ctx context.Context, args ...string) *exec.Cmd {
	binary := "/usr/bin/docker"
	env := []string{"LANG=C", "PATH=/usr/bin:/bin", "DOCKER_HOST=unix:///var/run/docker.sock"}
	if runtime.GOOS == "windows" {
		programFiles := os.Getenv("ProgramFiles")
		if !filepath.IsAbs(programFiles) {
			programFiles = `C:\Program Files`
		}
		binary = filepath.Join(programFiles, "Docker", "Docker", "resources", "bin", "docker.exe")
		env = []string{"SystemRoot=" + os.Getenv("SystemRoot"), "DOCKER_HOST=npipe:////./pipe/docker_engine"}
	}
	// Use only the local service identity for the CLI's registry configuration.
	if home, err := os.UserHomeDir(); err == nil {
		env = append(env, "DOCKER_CONFIG="+filepath.Join(home, ".docker"))
	}
	cmd := exec.CommandContext(ctx, binary, args...)
	cmd.Env = env
	cmd.WaitDelay = time.Second
	return cmd
}

func DockerStatus(ctx context.Context) (string, error) {
	data, err := docker(ctx, "ps", "--format", "{{.Names}}\t{{.Status}}", "--last", "100").Output()
	if err != nil {
		return "", errors.New("Docker status unavailable")
	}
	return strings.ToValidUTF8(string(data[:min(len(data), 16<<10)]), ""), nil
}

func currentEnv(dir *os.Root, validate bool) (string, []byte, error) {
	data, err := readFile(dir, ".env", maxEnv)
	if errors.Is(err, os.ErrNotExist) {
		return os.DevNull, nil, nil
	}
	if err != nil || (validate && validateEnv(string(data)) != nil) {
		return "", nil, errors.New("existing .env is outside the supported format")
	}
	return ".env", data, nil
}

func readFile(dir *os.Root, name string, limit int) ([]byte, error) {
	info, err := dir.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > int64(limit) {
		return nil, errors.New("file is not a bounded regular file")
	}
	file, err := dir.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, int64(limit)+1))
	if err != nil || len(data) > limit {
		return nil, errors.New("file is unreadable or too large")
	}
	return data, nil
}

func tempFile(dir *os.Root, content string) (string, error) {
	var suffix [16]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return "", err
	}
	name := ".osc-" + hex.EncodeToString(suffix[:])
	file, err := dir.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return "", err
	}
	_, writeErr := io.WriteString(file, content)
	syncErr := file.Sync()
	if err := errors.Join(writeErr, syncErr, file.Close()); err != nil {
		_ = dir.Remove(name)
		return "", err
	}
	return name, nil
}

func validateEnv(content string) error {
	if len(content) > maxEnv || !utf8.ValidString(content) || strings.IndexByte(content, 0) >= 0 {
		return errors.New(".env is invalid or too large")
	}
	for index, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, value, ok := strings.Cut(line, "=")
		name = strings.TrimSpace(name)
		upper := strings.ToUpper(name)
		if !ok || !envKey.MatchString(name) || strings.HasPrefix(upper, "COMPOSE_") || strings.HasPrefix(upper, "DOCKER_") {
			return fmt.Errorf(".env line %d has an invalid or reserved variable", index+1)
		}
		value = strings.TrimSpace(value)
		if value != "" && (value[0] == '\'' || value[0] == '"') {
			if len(value) < 2 || value[len(value)-1] != value[0] || strings.ContainsAny(value[1:len(value)-1], "'\"\\") {
				return fmt.Errorf(".env line %d requires a single-line quoted value", index+1)
			}
		}
		if strings.ContainsAny(value, "\r\x00") {
			return fmt.Errorf(".env line %d contains an invalid character", index+1)
		}
	}
	return nil
}

func validateCompose(content string) error {
	if len(content) > maxCompose || !utf8.ValidString(content) || strings.IndexByte(content, 0) >= 0 {
		return errors.New("compose.yaml is invalid or too large")
	}
	decoder := yaml.NewDecoder(strings.NewReader(content))
	var doc yaml.Node
	if err := decoder.Decode(&doc); err != nil || len(doc.Content) != 1 {
		return errors.New("compose.yaml must contain valid YAML")
	}
	var trailing yaml.Node
	if !errors.Is(decoder.Decode(&trailing), io.EOF) || !plainYAML(doc.Content[0], 0) {
		return errors.New("compose.yaml must be a single YAML document with unique keys and plain nodes")
	}
	root := mapping(doc.Content[0])
	services := mapping(root["services"])
	volumes := mapping(root["volumes"])
	if services == nil || len(services) == 0 {
		return errors.New("Compose requires at least one service")
	}
	for key, value := range root {
		switch key {
		case "services":
		case "volumes":
			if value.Kind != yaml.MappingNode {
				return errors.New("Compose volumes must be a mapping")
			}
		default:
			return errors.New("unsupported top-level Compose field. Use services and optional named volumes")
		}
	}
	for name, config := range volumes {
		if !serviceName.MatchString(name) || (config.Tag != "!!null" && !(config.Kind == yaml.MappingNode && len(config.Content) == 0)) {
			return errors.New("named volumes must use the default local configuration")
		}
	}
	for name, entry := range services {
		service := mapping(entry)
		if !serviceName.MatchString(name) || service == nil || service["image"] == nil || !imageName.MatchString(service["image"].Value) {
			return errors.New("each service requires a valid name and a literal image reference")
		}
		for key, value := range service {
			switch key {
			case "image", "command", "entrypoint", "environment", "restart", "depends_on", "healthcheck", "labels", "working_dir", "user", "read_only", "init", "mem_limit", "cpus":
			case "ports", "expose":
				if value.Kind != yaml.SequenceNode {
					return errors.New("ports must use literal short syntax")
				}
				for _, port := range value.Content {
					if port.Kind != yaml.ScalarNode || !portMapping.MatchString(port.Value) {
						return errors.New("ports must use literal short syntax")
					}
				}
			case "volumes":
				if value.Kind != yaml.SequenceNode {
					return errors.New("mounts must use named volumes in short syntax")
				}
				for _, mount := range value.Content {
					match := namedMount.FindStringSubmatch(mount.Value)
					if len(match) == 0 || volumes[match[1]] == nil || mount.Kind != yaml.ScalarNode {
						return errors.New("mounts must reference a declared named volume")
					}
				}
			default:
				return errors.New("unsupported Compose service field")
			}
		}
	}
	return nil
}

func plainYAML(node *yaml.Node, depth int) bool {
	if depth > 32 || node.Anchor != "" {
		return false
	}
	switch node.Kind {
	case yaml.MappingNode:
		keys := make(map[string]bool, len(node.Content)/2)
		for i := 0; i < len(node.Content); i += 2 {
			key := node.Content[i]
			if key.Kind != yaml.ScalarNode || key.Tag != "!!str" || key.Anchor != "" || keys[key.Value] {
				return false
			}
			keys[key.Value] = true
			if !plainYAML(node.Content[i+1], depth+1) {
				return false
			}
		}
		return node.Tag == "!!map"
	case yaml.SequenceNode:
		for _, child := range node.Content {
			if !plainYAML(child, depth+1) {
				return false
			}
		}
		return node.Tag == "!!seq"
	case yaml.ScalarNode:
		switch node.Tag {
		case "!!str", "!!null", "!!bool", "!!int", "!!float":
			return true
		}
	}
	return false
}

func mapping(node *yaml.Node) map[string]*yaml.Node {
	if node == nil || node.Kind != yaml.MappingNode {
		return nil
	}
	fields := make(map[string]*yaml.Node, len(node.Content)/2)
	for i := 0; i < len(node.Content); i += 2 {
		fields[node.Content[i].Value] = node.Content[i+1]
	}
	return fields
}

type progress struct {
	emit func(string) error
	err  error
	line []byte
}

func (w *progress) Write(p []byte) (int, error) {
	for _, b := range p {
		switch {
		case b == '\n' || b == '\r':
			w.publishLine()
			w.line = w.line[:0]
		case len(w.line) < 2048:
			w.line = append(w.line, b)
		}
	}
	return len(p), nil
}

func (w *progress) publishLine() {
	if w.err != nil {
		return
	}
	fields := strings.Fields(string(w.line))
	for _, field := range fields {
		switch strings.ToLower(field) {
		case "pulling", "pulled", "downloading", "extracting", "creating", "created", "starting", "started",
			"stopping", "stopped", "removing", "removed", "restarting", "restarted", "waiting", "healthy":
			// Compose can include interpolated secrets in diagnostic output. Emit only known progress terms.
			w.err = w.emit("Docker Compose: " + strings.ToLower(field) + "\n")
			return
		}
	}
}
