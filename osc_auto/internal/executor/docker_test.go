package executor

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestParsePackages(t *testing.T) {
	deb := parsePackages("Package: a\nStatus: install ok installed\nVersion: 1\n\nPackage: b\nStatus: deinstall ok config-files\nVersion: 2\n", "deb")
	if len(deb) != 1 || deb[0].Name != "a" || deb[0].Version != "1" || deb[0].Type != "deb" {
		t.Fatalf("unexpected Debian packages: %#v", deb)
	}
	apk := parsePackages("P:musl\nV:1.2\n\nP:busybox\nV:1.3\n", "apk")
	if len(apk) != 2 || apk[0].Name != "musl" || apk[1].Type != "apk" {
		t.Fatalf("unexpected Alpine packages: %#v", apk)
	}
}
func TestDockerRejectsUnsafeTargets(t *testing.T) {
	d := Docker{}
	for _, target := range []string{"--force", "abc", "../../etc/passwd", "abcdefabcdef;echo"} {
		if err := d.Action(context.Background(), "start", target); err == nil {
			t.Fatalf("accepted target %q", target)
		}
		if _, err := d.Inspect(context.Background(), target); err == nil {
			t.Fatalf("accepted inspect target %q", target)
		}
	}
	if err := d.Action(context.Background(), "remove", "abcdefabcdef"); err == nil {
		t.Fatal("accepted unlisted action")
	}
}

func TestSnapshotKeepsInventoryOnSBOMFailures(t *testing.T) {
	list := []Container{{ID: "aaaaaaaaaaaa", Image: "a", State: "running"}, {ID: "bbbbbbbbbbbb", Image: "b", State: "running"}, {ID: "cccccccccccc", Image: "c", State: "running"}, {ID: "dddddddddddd", Image: "d", State: "exited"}}
	snapshot, err := buildSnapshot(context.Background(), list, func(_ context.Context, id string) (SBOM, error) {
		switch id {
		case "aaaaaaaaaaaa":
			return SBOM{}, errors.New("container disappeared")
		case "bbbbbbbbbbbb":
			return SBOM{ContainerID: id, Image: "b", Status: "available", Packages: make([]Package, 2001)}, nil
		default:
			return SBOM{ContainerID: id, Image: "c", Status: "available", Packages: []Package{{Name: "ok", Version: "1", Type: "deb"}}}, nil
		}
	})
	if err != nil || len(snapshot.Containers) != 4 || len(snapshot.SBOM) != 3 {
		t.Fatalf("snapshot %#v, error %v", snapshot, err)
	}
	if snapshot.SBOM[0].Status != "unavailable" || snapshot.SBOM[1].Status != "too_large" || snapshot.SBOM[2].Status != "available" || len(snapshot.SBOM[2].Packages) != 1 {
		t.Fatalf("unexpected statuses: %#v", snapshot.SBOM)
	}
}

func TestSnapshotAggregateLimitMarksLargest(t *testing.T) {
	list := []Container{{ID: "aaaaaaaaaaaa", State: "running"}, {ID: "bbbbbbbbbbbb", State: "running"}}
	snapshot, err := buildSnapshot(context.Background(), list, func(_ context.Context, id string) (SBOM, error) {
		n := 400
		if id == "aaaaaaaaaaaa" {
			n = 700
		}
		packages := make([]Package, n)
		for i := range packages {
			packages[i] = Package{Name: strings.Repeat("x", 1200), Version: "1", Type: "deb"}
		}
		return SBOM{ContainerID: id, Status: "available", Packages: packages}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.SBOM[0].Status != "too_large" || snapshot.SBOM[1].Status != "available" {
		t.Fatalf("unexpected statuses: %s, %s", snapshot.SBOM[0].Status, snapshot.SBOM[1].Status)
	}
}
