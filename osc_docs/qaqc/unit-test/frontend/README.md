# Unit Test Frontend

Status: Disetujui (0.6)

Frontend Next.js memakai Vitest, Testing Library, dan Mock Service Worker. Unit test fokus pada perilaku pengguna, helper, dan kontrak API.

## 1. Alat

| Kebutuhan | Pilihan |
|---|---|
| Test runner | Vitest |
| Komponen | Testing Library + user-event |
| Network | Mock Service Worker |
| Aksesibilitas | jest-axe atau axe-core |
| Validasi | Zod schema test |
| Tipe | `tsc --noEmit` |

## 2. Matriks kasus wajib

| Area | Kasus |
|---|---|
| Izin | `can()` untuk modul, submenu sensitif, area di luar scope |
| API client | Envelope sukses/gagal, CSRF, `Accept-Language`, `request_id` |
| Error | Pemetaan kode ke pesan, fallback umum, countdown rate limit |
| i18n | Resolusi locale, fallback `en`, plural, paritas kunci |
| Form | Validasi klien, pesan field, state loading, submit ganda |
| Query | Query key memuat `company_id` dan `area_id` |
| Komponen | Tabel, dialog approval, empty state, error state |
| Keamanan | Tidak ada token di storage; redirect hanya path internal |

## 3. Pola tes

- Render komponen bersama provider i18n, query client, dan session palsu.
- Gunakan MSW untuk batas network; jangan memock modul internal.
- Uji teks yang terlihat pengguna, bukan nama class atau struktur DOM.
- Gunakan `userEvent` untuk interaksi.
- Untuk locale, render dengan `en` dan `id`; pastikan kunci tidak kosong.
- Uji kasus negatif: 401 bisnis `AA00-00-0002`, akses ditolak, data di luar scope.

## 4. Aturan

- Jangan memakai snapshot DOM besar; snapshot mudah usang dan tidak menguji perilaku.
- E2E Playwright terpisah untuk login, ganti perusahaan, aset, deploy, approval, audit.
- MSW handler harus mencerminkan envelope dan header backend.
- Tes tidak boleh bergantung pada waktu nyata; gunakan fake timer.
- Kunci terjemahan baru wajib memiliki tes paritas `en`/`id`.

## 5. Perintah

```bash
pnpm test
pnpm vitest run --coverage
pnpm tsc --noEmit
```

## 6. Checklist

- [ ] Helper izin diuji.
- [ ] API client dan error mapping diuji.
- [ ] i18n dan fallback diuji.
- [ ] Form dan dialog approval diuji.
- [ ] Query key tenant diuji.
- [ ] Tidak ada token di storage.
- [ ] Tes berjalan di `en` dan `id`.
- [ ] E2E alur kritis tersedia di suite terpisah.
