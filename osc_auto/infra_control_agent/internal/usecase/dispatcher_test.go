package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/domain"
)

// --- fakes ----------------------------------------------------------------

type fakeSource struct{ dispatches []domain.Dispatch }

func (f *fakeSource) FetchPending(context.Context) ([]domain.Dispatch, error) {
	return f.dispatches, nil
}

type fakeAcker struct {
	acks []domain.AckResult
}

func (f *fakeAcker) Ack(_ context.Context, a domain.AckResult) error {
	f.acks = append(f.acks, a)
	return nil
}

type fakeLogs struct {
	published []domain.LogPublish
}

func (f *fakeLogs) Publish(_ context.Context, lp domain.LogPublish) error {
	f.published = append(f.published, lp)
	return nil
}

type fakeRunner struct {
	out       string
	err       error
	calls     []runCall
	failFirst int // gagal N eksekusi pertama (lalu sukses) — simulasi rollback
}

type runCall struct {
	name string
	args []string
	dir  string
}

func (f *fakeRunner) Run(_ context.Context, name string, args []string, dir string, _ time.Duration) (string, error) {
	f.calls = append(f.calls, runCall{name: name, args: args, dir: dir})
	if f.failFirst > 0 {
		f.failFirst--
		return f.out, f.err
	}
	return f.out, nil
}

// fakeFS — in-memory filesystem dengan dukungan symlink-sim sederhana.
type fakeFS struct {
	files    map[string][]byte
	dirs     map[string]bool
	symlinks map[string]string // path → target
}

func newFakeFS() *fakeFS {
	return &fakeFS{files: map[string][]byte{}, dirs: map[string]bool{}, symlinks: map[string]string{}}
}

func (f *fakeFS) ReadFile(path string) ([]byte, error) {
	if b, ok := f.files[path]; ok {
		return b, nil
	}
	return nil, errors.New("tidak ada")
}

func (f *fakeFS) WriteFileAtomic(path string, data []byte, _ uint32) error {
	f.files[path] = data
	return nil
}

func (f *fakeFS) MkdirAll(path string, _ uint32) error {
	f.dirs[path] = true
	return nil
}

func (f *fakeFS) EvalSymlinks(path string) (string, error) {
	// Simulasi: resolve symlink satu level; target di luar root tetap
	// terdeteksi lewat prefix check di ValidateInsideRoot.
	for {
		t, ok := f.symlinks[path]
		if !ok {
			return path, nil
		}
		path = t
	}
}

func (f *fakeFS) Exists(path string) bool { _, ok := f.files[path]; return ok }

func (f *fakeFS) RemoveFile(path string) error { delete(f.files, path); return nil }

// --- helper ----------------------------------------------------------------

func newTestDispatcher(fs *fakeFS, runner *fakeRunner, stackRef string) (*Dispatcher, *fakeAcker, *fakeLogs) {
	acker := &fakeAcker{}
	logs := &fakeLogs{}
	d := NewDispatcher(&fakeSource{}, acker, logs, runner, fs,
		"/opt/omnisight/stacks", "/etc/nginx/conf.d", "docker", "nginx", testLogger())
	return d, acker, logs
}

const validCompose = "services:\n  web:\n    image: nginx:latest\n"

func stackDispatch(dir string) domain.Dispatch {
	return domain.Dispatch{
		DispatchRef: "ref-1", Kind: domain.DispatchKindDockerStack, Command: domain.CmdUp,
		Stack: &domain.StackDispatch{
			ID: "stack-1", Name: "monitoring", WorkingDir: dir,
			ComposeContent: validCompose, Env: "KEY=VALUE",
		},
	}
}

// --- tests -------------------------------------------------------------------

func TestExecuteStackSuccess(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{out: "Container web  Started"}
	d, acker, logs := newTestDispatcher(fs, runner, "")

	fs.dirs["/opt/omnisight/stacks"] = true
	if err := d.execute(context.Background(), stackDispatch("/opt/omnisight/stacks/monitoring")); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if len(acker.acks) != 1 || acker.acks[0].Status != domain.StatusApplied {
		t.Fatalf("ack salah: %+v", acker.acks)
	}
	// compose.yaml + .env ditulis.
	if !fs.Exists("/opt/omnisight/stacks/monitoring/compose.yaml") {
		t.Fatal("compose.yaml tidak ditulis")
	}
	if !fs.Exists("/opt/omnisight/stacks/monitoring/.env") {
		t.Fatal(".env tidak ditulis")
	}
	// Command tanpa shell: binary + args eksplisit.
	c := runner.calls[0]
	if c.name != "docker" || c.args[0] != "compose" || strings.Join(c.args, " ") != "compose -f compose.yaml up -d" {
		t.Fatalf("args salah: %v", c.args)
	}
	// Log dipublikasikan.
	if len(logs.published) != 1 || logs.published[0].Scope != domain.DispatchKindDockerStack {
		t.Fatalf("log salah: %+v", logs.published)
	}
}

func TestExecuteStackTraversalRejected(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	d, acker, _ := newTestDispatcher(fs, runner, "")

	disp := stackDispatch("/opt/omnisight/stacks/../sneaky")
	if err := d.execute(context.Background(), disp); err != nil {
		t.Fatalf("execute harus tetap ack (bukan error flow): %v", err)
	}
	if len(acker.acks) != 1 || acker.acks[0].Status != domain.StatusFailed {
		t.Fatalf("traversal harus FAILED: %+v", acker.acks)
	}
	if !strings.Contains(acker.acks[0].LastError, "tidak aman") {
		t.Fatalf("last_error harus jelaskan path tidak aman: %s", acker.acks[0].LastError)
	}
	if len(runner.calls) != 0 {
		t.Fatal("command TIDAK BOLEH dijalankan untuk path tidak aman")
	}
}

func TestExecuteStackRelativeDirRejected(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	d, acker, _ := newTestDispatcher(fs, runner, "")
	if err := d.execute(context.Background(), stackDispatch("relative/dir")); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusFailed || len(runner.calls) != 0 {
		t.Fatalf("dir relatif harus ditolak: %+v", acker.acks)
	}
}

func TestExecuteStackSymlinkEscapeRejected(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	d, acker, _ := newTestDispatcher(fs, runner, "")

	// Symlink di dalam stack dir yang menunjuk keluar root.
	fs.dirs["/opt/omnisight/stacks"] = true
	fs.symlinks["/opt/omnisight/stacks/escape"] = "/etc/nginx"
	if err := d.execute(context.Background(), stackDispatch("/opt/omnisight/stacks/escape")); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusFailed || len(runner.calls) != 0 {
		t.Fatalf("symlink escape harus ditolak: %+v", acker.acks)
	}
}

func TestExecuteStackComposeFailureAcksFailed(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{out: "yaml: line 2: unknown", err: errors.New("exit status 1"), failFirst: 10}
	d, acker, _ := newTestDispatcher(fs, runner, "")

	if err := d.execute(context.Background(), stackDispatch("/opt/omnisight/stacks/mon")); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusFailed {
		t.Fatalf("kegagalan docker compose harus FAILED: %+v", acker.acks)
	}
	if !strings.Contains(acker.acks[0].LastError, "docker compose up gagal") {
		t.Fatalf("last_error harus informatif: %s", acker.acks[0].LastError)
	}
}

func TestExecuteStackBadComposeContentRejected(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	d, acker, _ := newTestDispatcher(fs, runner, "")

	disp := stackDispatch("/opt/omnisight/stacks/mon")
	disp.Stack.ComposeContent = "include:\n  - other.yaml\nservices:\n  web:\n    image: x\n"
	if err := d.execute(context.Background(), disp); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusFailed {
		t.Fatalf("compose with include harus FAILED: %+v", acker.acks)
	}
	if len(runner.calls) != 0 {
		t.Fatal("docker compose TIDAK boleh dijalankan untuk compose invalid")
	}
}

func TestExecuteStackIllegalCommandRejected(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	d, acker, _ := newTestDispatcher(fs, runner, "")
	disp := stackDispatch("/opt/omnisight/stacks/mon")
	disp.Command = "exec"
	if err := d.execute(context.Background(), disp); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusFailed || len(runner.calls) != 0 {
		t.Fatalf("command di luar enum harus ditolak: %+v", acker.acks)
	}
}

const validVhost = "server {\n  listen 80;\n  server_name app.example.com;\n}\n"
const brokenVhost = "server {\n  listen 80;\n  server_name app.example.com;\n"

func vhostDispatch(id string, content string) domain.Dispatch {
	return domain.Dispatch{
		DispatchRef: "ref-vh-" + id, Kind: domain.DispatchKindNginxVhost, Command: domain.CmdTestReload,
		Vhost: &domain.VhostDispatch{ID: id, ServerName: "app.example.com", ListenPort: 80, ConfigContent: content},
	}
}

func TestExecuteVhostSuccess(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{out: "syntax is ok\ntest is successful"}
	d, acker, _ := newTestDispatcher(fs, runner, "")

	if err := d.execute(context.Background(), vhostDispatch("vh1", validVhost)); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusApplied {
		t.Fatalf("harus APPLIED: %+v", acker.acks)
	}
	if !fs.Exists("/etc/nginx/conf.d/vh1.conf") {
		t.Fatal("config vhost tidak ditulis")
	}
	// Urutan: tulis file → nginx -t → nginx -s reload.
	if len(runner.calls) != 2 {
		t.Fatalf("harus 2 exec (test, reload), dapat %d", len(runner.calls))
	}
	if runner.calls[0].args[0] != "-t" || runner.calls[1].args[0] != "-s" {
		t.Fatalf("urutan nginx salah: %+v", runner.calls)
	}
}

func TestExecuteVhostRollbackOnTestFailure(t *testing.T) {
	fs := newFakeFS()
	old := "server {\n  listen 81;\n}\n"
	fs.files["/etc/nginx/conf.d/vh1.conf"] = []byte(old)

	// nginx -t gagal pada eksekusi pertama; rollback -t berhasil (failFirst=1).
	d2, acker2, _ := newTestDispatcher(fs, &fakeRunner{out: "emerg: bad directive", err: errors.New("exit status 1"), failFirst: 1}, "")
	if err := d2.execute(context.Background(), vhostDispatch("vh1", "server {\n  bogus_directive x;\n}\n")); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker2.acks[0].Status != domain.StatusRolledBack {
		t.Fatalf("harus ROLLED_BACK: %+v", acker2.acks)
	}
	// Konten lama direstore.
	if got := string(fs.files["/etc/nginx/conf.d/vh1.conf"]); got != old {
		t.Fatalf("rollback tidak restore konten lama: %q", got)
	}
}

func TestExecuteVhostRollbackDeletesNewFile(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{out: "emerg: unknown directive", err: errors.New("exit status 1"), failFirst: 1}
	d, acker, _ := newTestDispatcher(fs, runner, "")

	// Struktural valid (brace seimbang) tapi nginx -t gagal → rollback.
	content := "server {\n  listen 80;\n  bogus_directive x;\n}\n"
	if err := d.execute(context.Background(), vhostDispatch("vh-new", content)); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusRolledBack {
		t.Fatalf("harus ROLLED_BACK: %+v", acker.acks)
	}
	if fs.Exists("/etc/nginx/conf.d/vh-new.conf") {
		t.Fatal("kandidat baru harus dihapus saat rollback (tanpa config lama)")
	}
}

func TestExecuteVhostBrokenBracesRejected(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	d, acker, _ := newTestDispatcher(fs, runner, "")
	if err := d.execute(context.Background(), vhostDispatch("vh2", brokenVhost)); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if acker.acks[0].Status != domain.StatusFailed {
		t.Fatalf("brace tidak seimbang harus FAILED: %+v", acker.acks)
	}
	if len(runner.calls) != 0 {
		t.Fatal("nginx TIDAK boleh dijalankan untuk config invalid")
	}
}

func TestRunOnceIdempotentDispatchRef(t *testing.T) {
	fs := newFakeFS()
	runner := &fakeRunner{}
	acker := &fakeAcker{}
	logs := &fakeLogs{}
	src := &fakeSource{dispatches: []domain.Dispatch{stackDispatch("/opt/omnisight/stacks/mon")}}
	d := NewDispatcher(src, acker, logs, runner, fs,
		"/opt/omnisight/stacks", "/etc/nginx/conf.d", "docker", "nginx", testLogger())
	fs.dirs["/opt/omnisight/stacks"] = true

	if err := d.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if err := d.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce #2: %v", err)
	}
	if len(acker.acks) != 1 {
		t.Fatalf("dispatch_ref sama harus idempoten, ack count: %d", len(acker.acks))
	}
}

func TestValidateInsideRootRules(t *testing.T) {
	fs := newFakeFS()
	root := "/opt/omnisight/stacks"
	fs.dirs[root] = true

	cases := []struct {
		name   string
		target string
		wantOK bool
	}{
		{"nested ok", "/opt/omnisight/stacks/a/b", true},
		{"root sendiri", root, true},
		{"traversal", "/opt/omnisight/stacks/../etc", false},
		{"relatif", "stacks/a", false},
		{"luar root", "/etc/nginx", false},
		{"tilde", "/opt/omnisight/stacks/~", false},
		{"backslash", "/opt/omnisight/stacks\\x", false},
		{"prefix telanjur", "/opt/omnisight/stacks-evil/x", false},
	}
	for _, tc := range cases {
		_, err := ValidateInsideRoot(fs, root, tc.target)
		if tc.wantOK && err != nil {
			t.Fatalf("%s: tidak boleh error: %v", tc.name, err)
		}
		if !tc.wantOK && err == nil {
			t.Fatalf("%s: harus ditolak", tc.name)
		}
	}
}
