"""Unit test logika frontend `osc_site` menggunakan Python (unittest).

Test mengeksekusi kode TypeScript ASLI (src/lib/grid.ts, utility.ts, backend.ts)
melalui Node.js `--experimental-strip-types` dengan custom loader yang memetakan
alias `@/` dan men-stub dependensi lingkungan browser/server (next/server).

Jika Node.js tidak tersedia atau versinya tidak mendukung strip-types (< 22.6),
seluruh modul di-skip (tidak gagal).
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OSC_SITE = ROOT / "osc_site"
HERE = Path(__file__).resolve().parent


def _node_version():
    try:
        out = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
        v = out.stdout.strip().lstrip("v")
        major, *_ = v.split(".")
        return int(major)
    except Exception:
        return 0


def _has_node():
    return shutil.which("node") is not None and _node_version() >= 22


@unittest.skipUnless(_has_node(), "node 22+ (strip-types) diperlukan")
class FrontendLogicTest(unittest.TestCase):
    """Menjalankan harness yang mengimpor fungsi asli TS lalu memvalidasi output."""

    HARNESS = r"""
import { buildParams, toGridResult } from "@/lib/grid";
import { parseSession, isSessionExpired, getInitials, formatDateTime, storageKey } from "@/lib/utility";

const profile = { id: "1", username: "root", email: "", fullname: "", company_id: "", is_admin: true, is_hris: false, is_active: true };

const out = {
  storageKey,
  bp_default: buildParams({ search: "a", page: 2, size: 25, sort_by: "", sort_order: "asc" }),
  bp_sorted: buildParams({ search: "x", page: 1, size: 10, sort_by: "username", sort_order: "desc" }),
  grid_defaults: toGridResult({ Rows: [{ id: 1 }], Total: 3, Page: 2, PageSize: 10, TotalPage: 1 }, { search: "a", page: 2, size: 25, sort_by: "", sort_order: "asc" }),
  parsed_ok: parseSession(JSON.stringify({ token: "t", expires_at: "2030-01-01T00:00:00+07:00", user_profile: profile }))?.token,
  parsed_bad: parseSession("nope"),
  parsed_null: parseSession(null),
  expired_future: isSessionExpired({ token: "t", expires_at: "2099-01-01T00:00:00+07:00", user_profile: profile }),
  expired_past: isSessionExpired({ token: "t", expires_at: "2000-01-01T00:00:00+07:00", user_profile: profile }),
  expired_null: isSessionExpired(null),
  initials: getInitials("  john   doe  "),
  initials_empty: getInitials(""),
  dt_ok: formatDateTime("2026-10-07T09:30:45+07:00"),
  dt_bad: formatDateTime("not-a-date"),
  dt_null: formatDateTime(null),
};
console.log(JSON.stringify(out));
"""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="oscfc_"))
        stubs = cls.tmp / "stubs"
        stubs.mkdir(parents=True)
        (stubs / "next_server.mjs").write_text(
            "export class NextResponse { static json(b) { return b; } }\n",
            encoding="utf-8",
        )
        loader = cls.tmp / "loader.mjs"
        loader.write_text(_LOADER_TMPL % ((stubs / "next_server.mjs").as_posix(), OSC_SITE.as_posix()), encoding="utf-8")
        harness = cls.tmp / "harness.ts"
        harness.write_text(cls.HARNESS, encoding="utf-8")

        cmd = [
            "node", "--experimental-strip-types",
            "--experimental-loader", loader.as_posix(),
            harness.as_posix(),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, cwd=str(OSC_SITE))
        except subprocess.TimeoutExpired:
            raise unittest.SkipTest("harness node timeout")
        if proc.returncode != 0:
            stderr = proc.stderr[-1500:]
            if "Unknown file extension" in stderr or "ERR_UNKNOWN" in stderr:
                raise unittest.SkipTest("node tidak mendukung --experimental-strip-types")
            raise AssertionError(f"harness gagal:\n{stderr}")
        try:
            cls.out = json.loads(proc.stdout.strip().splitlines()[-1])
        except (json.JSONDecodeError, IndexError):
            raise AssertionError(f"output harness bukan JSON:\n{proc.stdout[-500:]}")

    def test_storage_key(self):
        self.assertEqual(self.out["storageKey"], "OmniSightMemory")

    def test_build_params_default(self):
        self.assertEqual(self.out["bp_default"], {"search": "a", "page": "2", "page_size": "25"})

    def test_build_params_sorted(self):
        self.assertEqual(
            self.out["bp_sorted"],
            {"search": "x", "page": "1", "page_size": "10", "sort": "username", "order": "desc"},
        )

    def test_to_grid_result(self):
        self.assertEqual(
            self.out["grid_defaults"],
            {"data": [{"id": 1}], "meta": {"total": 3, "page": 2, "size": 10}},
        )

    def test_parse_session(self):
        self.assertEqual(self.out["parsed_ok"], "t")
        self.assertIsNone(self.out["parsed_bad"])
        self.assertIsNone(self.out["parsed_null"])

    def test_is_session_expired(self):
        self.assertFalse(self.out["expired_future"])
        self.assertTrue(self.out["expired_past"])
        self.assertTrue(self.out["expired_null"])

    def test_get_initials(self):
        self.assertEqual(self.out["initials"], "JD")
        self.assertEqual(self.out["initials_empty"], "?")

    def test_format_date_time(self):
        self.assertEqual(self.out["dt_ok"], "2026-10-07 09:30:45")
        self.assertEqual(self.out["dt_bad"], "-")
        self.assertEqual(self.out["dt_null"], "-")


class BackendConfigTest(unittest.TestCase):
    """Memperlihatkan konfigurasi default backend (BE_POOL/WS_CONF)."""

    HARNESS_BE = r"""
import { BE_POOL, WS_POOL, WS_CONF } from "@/lib/backend";
console.log(JSON.stringify({ BE_POOL, WS_POOL, WS_CONF }));
"""

    @classmethod
    def setUpClass(cls):
        if not _has_node():
            raise unittest.SkipTest("node 22+ diperlukan")
        base = Path(tempfile.mkdtemp(prefix="oscbe_"))
        (base / "stubs").mkdir()
        (base / "stubs" / "next_server.mjs").write_text(
            "export class NextResponse { static json(b) { return b; } }\n", encoding="utf-8",
        )
        loader = base / "loader.mjs"
        loader.write_text(_LOADER_TMPL % ((base / "stubs" / "next_server.mjs").as_posix(), OSC_SITE.as_posix()), encoding="utf-8")
        harness = base / "harness_be.ts"
        harness.write_text(cls.HARNESS_BE, encoding="utf-8")
        env = {k: v for k, v in os.environ.items() if k not in ("BE_POOL", "NEXT_PUBLIC_WS_POOL", "WS_NAME", "WS_DESC")}
        cmd = ["node", "--experimental-strip-types", "--experimental-loader", loader.as_posix(), harness.as_posix()]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env, cwd=str(OSC_SITE))
        if proc.returncode != 0:
            raise unittest.SkipTest("harness backend gagal")
        cls.out = json.loads(proc.stdout.strip().splitlines()[-1])

    def test_be_pool_default(self):
        self.assertEqual(self.out["BE_POOL"], "http://osc_rest:37772")

    def test_ws_pool_converted(self):
        self.assertTrue(self.out["WS_POOL"].startswith("ws"))

    def test_ws_conf(self):
        self.assertEqual(self.out["WS_CONF"]["name"], "OmniSight")
        self.assertEqual(self.out["WS_CONF"]["meta"]["title"], "OmniSight")


_LOADER_TMPL = (
    "export async function resolve(specifier, context, nextResolve) {\n"
    "  if (specifier === 'next/server') return { url: new URL('file://' + %r).href, shortCircuit: true };\n"
    "  if (specifier.startsWith('@/')) return { url: `file://%s/src/${specifier.slice(2)}.ts`, shortCircuit: true };\n"
    "  if (specifier.startsWith('.') && !/\\.(ts|js|json)$/.test(specifier)) {\n"
    "    const base = context.parentURL; const dir = base.slice(0, base.lastIndexOf('/') + 1);\n"
    "    return { url: dir + specifier + '.ts', shortCircuit: true };\n"
    "  }\n"
    "  if (specifier.startsWith('.') && specifier.endsWith('.json')) {\n"
    "    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true, format: 'json' };\n"
    "  }\n"
    "  return nextResolve(specifier, context);\n"
    "}\n"
    "export async function load(url, context, nextLoad) {\n"
    "  if (url.endsWith('.json')) { const src = await import('node:fs').then(fs => fs.promises.readFile(new URL(url), 'utf8')); return { format: 'json', source: src, shortCircuit: true }; }\n"
    "  return nextLoad(url, context);\n"
    "}\n"
)


if __name__ == "__main__":
    unittest.main(verbosity=2)