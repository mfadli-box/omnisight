// Package usecase — validasi path ketat (anti traversal/symlink) dan
// orkestrasi eksekusi dispatch docker compose & nginx. Pure logic —
// mudah di-unit-test, tanpa exec langsung (via port domain).
package usecase

import (
	"path/filepath"
	"strings"

	"github.com/mfadli-box/omnisight/osc_auto/infra_control_agent/internal/domain"
)

// ValidateInsideRoot memvalidasi bahwa target absolut, bersih, berada di
// dalam root, dan tidak menyertakan symlink yang keluar dari root.
//
// Aturan (selaras validator app-level osc_rest + penggandaan defense-in-depth):
//   - root wajib absolut & bersih;
//   - target wajib absolut (relatif → ErrPathUnsafe);
//   - "..", "~", backslash, kontrol char → ditolak;
//   - path dinormalisasi (filepath.Clean) lalu wajib berawalan root;
//   - symlinks di-resolve (EvalSymlinks) pada bagian yang sudah ada — hasil
//     resolve juga wajib berada di dalam root yang sudah di-resolve.
func ValidateInsideRoot(fs domain.FileSystem, root, target string) (string, error) {
	if root == "" {
		return "", domain.ErrPathUnsafe
	}
	if filepath.IsAbs(root) {
		root = filepath.Clean(root)
	} else {
		return "", domain.ErrPathUnsafe
	}
	if err := rejectUnsafeChars(target); err != nil {
		return "", err
	}
	if !filepath.IsAbs(target) {
		return "", domain.ErrPathUnsafe
	}
	clean := filepath.Clean(target)

	// Prefix check pada bentuk teks (cepat, sebelum syscall).
	rel, err := filepath.Rel(root, clean)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", domain.ErrPathUnsafe
	}

	// Symlink escape: resolve root dulu, lalu target.
	rootReal, err := fs.EvalSymlinks(root)
	if err != nil {
		return "", domain.ErrPathUnsafe
	}
	real, err := fs.EvalSymlinks(clean)
	if err != nil {
		// Bagian akhir belum ada (file baru): resolve parent-nya.
		parent := filepath.Dir(clean)
		realParent, err2 := fs.EvalSymlinks(parent)
		if err2 != nil {
			return "", domain.ErrPathUnsafe
		}
		real = filepath.Join(realParent, filepath.Base(clean))
	}
	relReal, err := filepath.Rel(rootReal, real)
	if err != nil || relReal == ".." || strings.HasPrefix(relReal, ".."+string(filepath.Separator)) {
		return "", domain.ErrPathUnsafe
	}
	return clean, nil
}

// rejectUnsafeChars menolak karakter/segment berbahaya pada path.
func rejectUnsafeChars(p string) error {
	if p == "" {
		return domain.ErrPathUnsafe
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f {
			return domain.ErrPathUnsafe // kontrol char
		}
	}
	if strings.Contains(p, "~") {
		return domain.ErrPathUnsafe
	}
	if strings.Contains(p, "\\") {
		return domain.ErrPathUnsafe
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == ".." {
			return domain.ErrPathUnsafe
		}
	}
	return nil
}

// ValidateComposeContent — gerbang struktural kedua di agent (server sudah
// men-allowlist; agent memvalidasi ulang defensif): batas ukuran, wajib
// "services:", tolak indentasi tab & key include.
func ValidateComposeContent(content string) error {
	const maxComposeBytes = 256 << 10 // 256 KB (kontrak server)
	if content == "" {
		return errorsNew("compose_content kosong")
	}
	if len(content) > maxComposeBytes {
		return errorsNew("compose_content melebihi 256 KB")
	}
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimLeft(line, " ")
		if len(trimmed) > 0 && strings.HasPrefix(trimmed, "\t") {
			return errorsNew("indentasi tab tidak diizinkan")
		}
	}
	if !hasTopLevelKey(content, "services") {
		return errorsNew("kunci top-level 'services:' wajib ada")
	}
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "include:") || strings.HasPrefix(trimmed, "- include") {
			return errorsNew("key 'include' tidak diizinkan")
		}
	}
	return nil
}

// ValidateNginxConfig — gerbang struktural config vhost: ukuran, brace
// seimbang (di luar komentar & string), blok server wajib, include absolut/
// wildcard tanpa traversal.
func ValidateNginxConfig(content string) error {
	const maxNginxBytes = 128 << 10 // 128 KB (kontrak server)
	if content == "" {
		return errorsNew("config_content kosong")
	}
	if len(content) > maxNginxBytes {
		return errorsNew("config_content melebihi 128 KB")
	}

	depth := 0
	inComment := false
	inQuote := byte(0)
	hasServerBlock := false
	for i := 0; i < len(content); i++ {
		c := content[i]
		switch {
		case inComment:
			if c == '\n' {
				inComment = false
			}
		case inQuote != 0:
			if c == '\\' && i+1 < len(content) {
				i++
			} else if c == inQuote {
				inQuote = 0
			}
		case c == '#':
			inComment = true
		case c == '"' || c == '\'':
			inQuote = c
		case c == '{':
			depth++
		case c == '}':
			depth--
			if depth < 0 {
				return errorsNew("brace '}' tidak seimbang")
			}
		}
	}
	if depth != 0 || inQuote != 0 {
		return errorsNew("brace/kutip tidak seimbang")
	}

	// server { (di luar komentar).
	lines := strings.Split(content, "\n")
	inComment = false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") {
			continue
		}
		if strings.Contains(trimmed, "server") && strings.Contains(trimmed, "{") {
			hasServerBlock = true
		}
		if strings.HasPrefix(trimmed, "include") {
			parts := strings.Fields(trimmed)
			if len(parts) >= 2 {
				arg := strings.TrimSuffix(strings.TrimSuffix(parts[1], ";"), ";")
				if !strings.HasPrefix(arg, "/") && !strings.Contains(arg, "*") {
					return errorsNew("include harus absolut atau wildcard")
				}
				if strings.Contains(arg, "..") {
					return errorsNew("include anti traversal")
				}
			}
		}
	}
	if !hasServerBlock {
		return errorsNew("blok server { wajib ada")
	}
	return nil
}

// hasTopLevelKey — baris "key:" di indentasi nol.
func hasTopLevelKey(content, key string) bool {
	for _, line := range strings.Split(content, "\n") {
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t' || line[0] == '-') {
			continue
		}
		trimmed := strings.TrimRight(line, " \t")
		if trimmed == key+":" || strings.HasPrefix(trimmed, key+":") {
			return true
		}
	}
	return false
}
