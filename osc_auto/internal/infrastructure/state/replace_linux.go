//go:build linux

package state

import "os"

func replaceFile(from, to string) error { return os.Rename(from, to) }
