// Adapter domain.FileSystem — implementasi nyata di disk dengan mode ketat
// dan penulisan atomik (tmp → rename).
package osfile

import (
	"os"
	"path/filepath"
)

// FS implementasi domain.FileSystem.
type FS struct{}

// New membangun adapter filesystem.
func New() *FS { return &FS{} }

// ReadFile membaca file.
func (FS) ReadFile(path string) ([]byte, error) { return os.ReadFile(path) }

// WriteFileAtomic — tulis ke file sementara lalu rename (atomik), mode 0600.
func (FS) WriteFileAtomic(path string, data []byte, mode uint32) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, os.FileMode(mode))
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	// chmod eksplisit (umask bisa menaikkan mode).
	if err := os.Chmod(tmp, os.FileMode(mode)); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

// MkdirAll — buat direktori bertingkat (chmod eksplisit anti umask longgar).
func (FS) MkdirAll(path string, mode uint32) error {
	if err := os.MkdirAll(path, os.FileMode(mode)); err != nil {
		return err
	}
	// Perbaiki mode tiap level yang sudah ada.
	_ = os.Chmod(path, os.FileMode(mode))
	return nil
}

// EvalSymlinks — resolve path (deteksi symlink escape di usecase).
func (FS) EvalSymlinks(path string) (string, error) { return filepath.EvalSymlinks(path) }

// Exists — true bila path ada.
func (FS) Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// RemoveFile — hapus file.
func (FS) RemoveFile(path string) error { return os.Remove(path) }
