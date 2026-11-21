package executor

import (
	"archive/tar"
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
	"time"
)

// Docker only permits fixed operations against the local Docker daemon.
type Docker struct{}

type Container struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	ImageID string `json:"image_id"`
	State   string `json:"state"`
	Status  string `json:"status"`
}

type Package struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Type    string `json:"type"`
}
type SBOM struct {
	ContainerID string    `json:"container_id"`
	Image       string    `json:"image"`
	Packages    []Package `json:"packages"`
	Status      string    `json:"status"`
}

var dockerID = regexp.MustCompile(`^[a-f0-9]{12,64}$`)

const dockerOutputLimit = 2 << 20

var errDockerOutputLimit = errors.New("Docker output exceeds limit")

type boundedBuffer struct {
	bytes.Buffer
	overflow bool
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > dockerOutputLimit {
		b.overflow = true
		return 0, errors.New("Docker output exceeds limit")
	}
	return b.Buffer.Write(p)
}
func dockerOutput(ctx context.Context, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := docker(ctx, args...)
	var out boundedBuffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		if out.overflow {
			return nil, errDockerOutputLimit
		}
		return nil, errors.New("local Docker operation failed")
	}
	return out.Bytes(), nil
}

// List returns only non-sensitive metadata; docker inspect output is never exposed.
func (Docker) List(ctx context.Context) ([]Container, error) {
	raw, err := dockerOutput(ctx, "ps", "--all", "--no-trunc", "--format", "{{json .}}")
	if err != nil {
		return nil, err
	}
	var items []Container
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 4096), 128<<10)
	for scanner.Scan() {
		var row struct{ ID, Names, Image, State, Status string }
		if json.Unmarshal(scanner.Bytes(), &row) != nil || !dockerID.MatchString(row.ID) {
			return nil, errors.New("invalid Docker list response")
		}
		items = append(items, Container{ID: row.ID, Name: row.Names, Image: row.Image, State: row.State, Status: row.Status})
	}
	if scanner.Err() != nil {
		return nil, errors.New("invalid Docker list response")
	}
	if items == nil {
		items = []Container{}
	}
	return items, nil
}

func (Docker) Inspect(ctx context.Context, id string) (Container, error) {
	if !dockerID.MatchString(id) {
		return Container{}, errors.New("invalid container ID")
	}
	raw, err := dockerOutput(ctx, "inspect", "--type", "container", "--format", "{{json .Id}}\t{{json .Name}}\t{{json .Config.Image}}\t{{json .Image}}\t{{json .State.Status}}", id)
	if err != nil {
		return Container{}, err
	}
	parts := strings.Split(strings.TrimSpace(string(raw)), "\t")
	if len(parts) != 5 {
		return Container{}, errors.New("invalid Docker inspect response")
	}
	var c Container
	fields := []*string{&c.ID, &c.Name, &c.Image, &c.ImageID, &c.State}
	for i, p := range parts {
		if json.Unmarshal([]byte(p), fields[i]) != nil {
			return Container{}, errors.New("invalid Docker inspect response")
		}
	}
	c.Name = strings.TrimPrefix(c.Name, "/")
	return c, nil
}

func (Docker) Action(ctx context.Context, action, id string) error {
	switch action {
	case "start", "stop":
		if !dockerID.MatchString(id) {
			return errors.New("invalid container ID")
		}
		_, err := dockerOutput(ctx, "container", action, id)
		return err
	case "prune_containers":
		if id != "" {
			return errors.New("invalid prune target")
		}
		_, err := dockerOutput(ctx, "container", "prune", "--force")
		return err
	case "prune_images":
		if id != "" {
			return errors.New("invalid prune target")
		}
		_, err := dockerOutput(ctx, "image", "prune", "--force")
		return err
	default:
		return errors.New("Docker action is outside the local allowlist")
	}
}

// SBOM reads package manager databases without running any code inside the container.
func (d Docker) SBOM(ctx context.Context, id string) (SBOM, error) {
	c, err := d.Inspect(ctx, id)
	if err != nil {
		return SBOM{}, err
	}
	if c.State != "running" {
		return SBOM{}, errors.New("container is not running")
	}
	result := SBOM{ContainerID: c.ID, Image: c.Image, Packages: []Package{}, Status: "unsupported"}
	for _, source := range []struct{ path, kind string }{{"/var/lib/dpkg/status", "deb"}, {"/lib/apk/db/installed", "apk"}} {
		raw, err := dockerOutput(ctx, "cp", id+":"+source.path, "-")
		if err != nil {
			if errors.Is(err, errDockerOutputLimit) {
				return SBOM{}, err
			}
			continue
		}
		tr := tar.NewReader(bytes.NewReader(raw))
		h, err := tr.Next()
		if err != nil || !h.FileInfo().Mode().IsRegular() || h.Size > dockerOutputLimit {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(tr, dockerOutputLimit+1))
		if err != nil || len(data) > dockerOutputLimit {
			continue
		}
		result.Packages = parsePackages(string(data), source.kind)
		result.Status = "available"
		return result, nil
	}
	return result, nil
}
func parsePackages(data, kind string) []Package {
	var out []Package
	for _, entry := range strings.Split(data, "\n\n") {
		var name, version, status string
		for _, line := range strings.Split(entry, "\n") {
			if kind == "deb" {
				if strings.HasPrefix(line, "Package: ") {
					name = strings.TrimPrefix(line, "Package: ")
				}
				if strings.HasPrefix(line, "Version: ") {
					version = strings.TrimPrefix(line, "Version: ")
				}
				if strings.HasPrefix(line, "Status: ") {
					status = strings.TrimPrefix(line, "Status: ")
				}
			} else {
				if strings.HasPrefix(line, "P:") {
					name = strings.TrimPrefix(line, "P:")
				}
				if strings.HasPrefix(line, "V:") {
					version = strings.TrimPrefix(line, "V:")
				}
			}
		}
		if name != "" && version != "" && (kind != "deb" || status == "install ok installed") {
			out = append(out, Package{Name: name, Version: version, Type: kind})
			if len(out) >= 10000 {
				break
			}
		}
	}
	if out == nil {
		out = []Package{}
	}
	return out
}

type SnapshotContainer struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Image             string `json:"image"`
	State             string `json:"state"`
	ImageUpdateStatus string `json:"image_update_status"`
}
type Snapshot struct {
	Containers []SnapshotContainer `json:"containers"`
	SBOM       []SBOM              `json:"sbom"`
}

func (d Docker) Snapshot(ctx context.Context) (Snapshot, error) {
	list, err := d.List(ctx)
	if err != nil {
		return Snapshot{}, err
	}
	return buildSnapshot(ctx, list, d.SBOM)
}

// buildSnapshot keeps inventory useful even when an individual container changes
// state or a package inventory exceeds the collector's limits.
func buildSnapshot(ctx context.Context, list []Container, collect func(context.Context, string) (SBOM, error)) (Snapshot, error) {
	if len(list) > 256 {
		return Snapshot{}, errors.New("Docker inventory exceeds container limit")
	}
	snap := Snapshot{Containers: []SnapshotContainer{}, SBOM: []SBOM{}}
	for _, c := range list {
		snap.Containers = append(snap.Containers, SnapshotContainer{ID: c.ID, Name: c.Name, Image: c.Image, State: c.State, ImageUpdateStatus: "unknown"})
		if c.State != "running" {
			continue
		}
		sbom, err := collect(ctx, c.ID)
		if ctx.Err() != nil {
			return Snapshot{}, ctx.Err()
		}
		if err != nil {
			status := "unavailable"
			if errors.Is(err, errDockerOutputLimit) {
				status = "too_large"
			}
			sbom = SBOM{ContainerID: c.ID, Image: c.Image, Packages: []Package{}, Status: status}
		} else if len(sbom.Packages) > 2000 {
			sbom.Packages = []Package{}
			sbom.Status = "too_large"
		}
		snap.SBOM = append(snap.SBOM, sbom)
	}
	// When the aggregate is too large, remove the largest package inventory at a
	// time and mark it explicitly. Never emit a silently truncated SBOM.
	for {
		body, err := json.Marshal(snap)
		if err != nil {
			return Snapshot{}, errors.New("Docker inventory cannot be encoded")
		}
		if len(body) <= 1<<20 {
			return snap, nil
		}
		largest, size := -1, 0
		for i, sbom := range snap.SBOM {
			if len(sbom.Packages) == 0 {
				continue
			}
			packages, err := json.Marshal(sbom.Packages)
			if err != nil {
				return Snapshot{}, errors.New("Docker inventory cannot be encoded")
			}
			if len(packages) > size {
				largest, size = i, len(packages)
			}
		}
		if largest < 0 {
			return Snapshot{}, errors.New("Docker inventory exceeds size limit")
		}
		snap.SBOM[largest].Packages = []Package{}
		snap.SBOM[largest].Status = "too_large"
	}
}

type Image struct {
	ID         string `json:"id"`
	Repository string `json:"repository"`
	Tag        string `json:"tag"`
	Size       string `json:"size"`
}

func (Docker) Images(ctx context.Context) ([]Image, error) {
	raw, err := dockerOutput(ctx, "image", "ls", "--no-trunc", "--format", "{{json .}}")
	if err != nil {
		return nil, err
	}
	images := []Image{}
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 4096), 128<<10)
	for scanner.Scan() {
		var row struct{ ID, Repository, Tag, Size string }
		if json.Unmarshal(scanner.Bytes(), &row) != nil || !dockerID.MatchString(strings.TrimPrefix(row.ID, "sha256:")) {
			return nil, errors.New("invalid Docker image list response")
		}
		images = append(images, Image{ID: row.ID, Repository: row.Repository, Tag: row.Tag, Size: row.Size})
	}
	if scanner.Err() != nil {
		return nil, errors.New("invalid Docker image list response")
	}
	return images, nil
}
func (Docker) InspectImage(ctx context.Context, id string) (Image, error) {
	if !dockerID.MatchString(strings.TrimPrefix(id, "sha256:")) {
		return Image{}, errors.New("invalid image ID")
	}
	raw, err := dockerOutput(ctx, "image", "inspect", "--format", "{{json .Id}}", id)
	if err != nil {
		return Image{}, err
	}
	var value string
	if json.Unmarshal(bytes.TrimSpace(raw), &value) != nil {
		return Image{}, errors.New("invalid Docker image inspect response")
	}
	return Image{ID: value}, nil
}
