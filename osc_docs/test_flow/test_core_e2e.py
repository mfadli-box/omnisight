"""Smoke test end-to-end alur inti OmniSight melalui stack Docker Compose.

Alur yang diuji: healthcheck, public companies, login admin, navigasi, pindah
company/area, pembuatan dan daftar SOP (termasuk lampiran RustFS), ekspor Excel
RP01, pembuatan PDF RP02, akses konektor SA04, dan pemeriksaan audit log.

Kredensial dibaca dari environment agar tidak menyimpan rahasia di repositori.
Untuk stack Compose bawaan, arahkan API ke port host 36664.
"""
from __future__ import annotations

import os
import uuid
import zipfile
from io import BytesIO

import httpx
import pytest

API = os.getenv("OMNISIGHT_TEST_API_URL", "http://127.0.0.1:36664").rstrip("/")
TIMEOUT = float(os.getenv("OMNISIGHT_TEST_TIMEOUT", "20"))


def required(*names: str) -> dict[str, str]:
    values = {name: os.getenv(name, "") for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        message = "fixture smoke test belum dikonfigurasi: " + ", ".join(missing)
        if os.getenv("OMNISIGHT_TEST_REQUIRE_FIXTURES") == "1":
            pytest.fail(message)
        pytest.skip(message)
    return values


def client() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=TIMEOUT, follow_redirects=False)


def body(response: httpx.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {}


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def token_of(response: httpx.Response) -> str:
    assert response.status_code == 200, (response.status_code, body(response).get("error"))
    data = body(response)["data"]
    assert data.get("mfa_required") is not True, "akun smoke test tidak boleh memerlukan MFA"
    token = data.get("access_token")
    assert token, "respons autentikasi tidak menyediakan access token"
    return token


def test_core_end_to_end_flow():
    credentials = required(
        "OMNISIGHT_TEST_ADMIN_USERNAME",
        "OMNISIGHT_TEST_ADMIN_PASSWORD",
    )
    report_table = os.getenv("OMNISIGHT_TEST_REPORT_TABLE", "osc_activity_log")
    document_code = f"E2E-{uuid.uuid4().hex}"
    attachment = f"OmniSight SOP attachment {document_code}\n".encode()

    with client() as api:
        # 1. Healthcheck REST.
        health = api.get("/baas/v1/health")
        assert health.status_code == 200, health.text
        assert health.text.strip() == "ok"

        # 2. Public companies harus dapat dibaca tanpa autentikasi.
        companies = api.get("/baas/v1/public/companies")
        assert companies.status_code == 200, body(companies)
        public_companies = body(companies).get("data", [])
        assert public_companies, "public companies kosong; terapkan seed demo/migrasi"
        for company in public_companies:
            assert company.get("id")
            assert company.get("code")
            assert company.get("name")
        public_company_ids = {company["id"] for company in public_companies}

        # 3. Login admin pada konteks bawaan.
        signed_in = api.post(
            "/baas/v1/auth/login",
            json={
                "username": credentials["OMNISIGHT_TEST_ADMIN_USERNAME"],
                "password": credentials["OMNISIGHT_TEST_ADMIN_PASSWORD"],
            },
        )
        first_token = token_of(signed_in)
        login_user = body(signed_in)["data"]["user"]
        login_company = login_user["company_id"]
        assert login_company in public_company_ids

        # 4. Navigasi sebelum pindah konteks.
        navigation = api.get("/baas/v1/me/navigation", headers=auth(first_token))
        assert navigation.status_code == 200, body(navigation)
        modules = {item.get("module_code") for item in body(navigation).get("data", [])}
        expected_modules = {"KB01", "RP01", "RP02", "SA03", "SA04"}
        assert expected_modules <= modules

        # 5. Pindah company/area memakai konteks yang tersedia.
        contexts_response = api.get("/baas/v1/me/contexts", headers=auth(first_token))
        assert contexts_response.status_code == 200, body(contexts_response)
        contexts = body(contexts_response).get("data", [])
        assert contexts, "tidak ada konteks company yang dapat dipilih"
        areas_by_company = {item["id"]: item["areas"] or [] for item in contexts}
        configured_company = os.getenv("OMNISIGHT_TEST_TARGET_COMPANY_ID")
        target_company = configured_company or next(
            (
                company_id
                for company_id, areas in areas_by_company.items()
                if company_id != login_company and areas
            ),
            login_company,
        )
        available_areas = areas_by_company.get(target_company, [])
        assert available_areas, f"company {target_company} tidak menyediakan area uji"
        target_area = os.getenv("OMNISIGHT_TEST_TARGET_AREA_ID") or (
            next(
                (area["id"] for area in available_areas if area["id"] != login_user["area_id"]),
                available_areas[0]["id"],
            )
        )
        assert any(area["id"] == target_area for area in available_areas)

        switched = api.post(
            "/baas/v1/auth/switch-company",
            headers=auth(first_token),
            json={"company_id": target_company, "area_id": target_area},
        )
        token = token_of(switched)
        switched_data = body(switched)["data"]
        assert switched_data["company_id"] == target_company
        assert switched_data["area_id"] == target_area

        context_navigation = api.get("/baas/v1/me/navigation", headers=auth(token))
        assert context_navigation.status_code == 200, body(context_navigation)
        context_modules = {
            item.get("module_code") for item in body(context_navigation).get("data", [])
        }
        assert expected_modules <= context_modules

        # 6. Buat SOP, unggah lampiran ke RustFS, unduh, lalu pastikan muncul di daftar.
        created = api.post(
            "/baas/v1/sop/documents",
            headers=auth(token),
            json={
                "document_code": document_code,
                "title": "OmniSight E2E SOP",
                "markdown_content": "# Smoke test\n\nDokumen dibuat oleh test end-to-end.",
            },
        )
        assert created.status_code == 201, body(created)
        document = body(created)["data"]
        document_id = document["id"]
        assert document["document_code"] == document_code
        assert document["approval_status"] == "DRAFT"
        assert document["company_id"] == target_company
        assert document["area_id"] == target_area

        attachment_path = f"/baas/v1/sop/documents/{document_id}/attachment"
        uploaded = api.post(
            attachment_path,
            headers={**auth(token), "Content-Type": "text/plain"},
            content=attachment,
        )
        assert uploaded.status_code == 200, body(uploaded)
        assert body(uploaded)["data"] == {"document_id": document_id, "uploaded": True}

        downloaded = api.get(attachment_path, headers=auth(token))
        assert downloaded.status_code == 200, body(downloaded)
        assert downloaded.content == attachment

        for offset in range(0, 10_000, 200):
            listed = api.get(
                "/baas/v1/sop/documents",
                headers=auth(token),
                params={"limit": 200, "offset": offset},
            )
            assert listed.status_code == 200, body(listed)
            page = body(listed)["data"]
            listed_document = next((item for item in page if item["id"] == document_id), None)
            if listed_document or len(page) < 200:
                break
        assert listed_document, f"SOP {document_code} tidak ditemukan di daftar"
        assert listed_document["document_code"] == document_code
        assert "rustfs_object_key" not in listed_document

        # 7. Ekspor Excel RP01 dan verifikasi struktur XLSX.
        excel = api.get(
            f"/baas/v1/reports/export-excel/{report_table}",
            headers=auth(token),
        )
        assert excel.status_code == 200, body(excel)
        assert excel.content.startswith(b"PK\x03\x04")
        excel_archive_id = excel.headers.get("x-report-archive-id")
        assert excel_archive_id
        with zipfile.ZipFile(BytesIO(excel.content)) as workbook:
            members = set(workbook.namelist())
            assert "[Content_Types].xml" in members
            assert "xl/workbook.xml" in members
            assert "xl/worksheets/sheet1.xml" in members

        # 8. Generate PDF RP02 dan verifikasi signature/EOF.
        pdf = api.post(
            "/baas/v1/reports/generate-pdf",
            headers=auth(token),
            json={"table_name": report_table},
        )
        assert pdf.status_code == 200, body(pdf)
        assert pdf.content.startswith(b"%PDF-")
        assert pdf.content.rstrip().endswith(b"%%EOF")
        pdf_archive_id = pdf.headers.get("x-report-archive-id")
        assert pdf_archive_id

        # 9. Kembali ke cakupan company-wide agar konektor SA04 dapat dibaca.
        wide = api.post(
            "/baas/v1/auth/switch-company",
            headers=auth(token),
            json={"company_id": target_company},
        )
        wide_token = token_of(wide)
        connector = api.get(
            f"/baas/v1/companies/{target_company}/connector",
            headers=auth(wide_token),
        )
        assert connector.status_code == 200, body(connector)
        connector_data = body(connector)["data"]
        assert connector_data["company_id"] == target_company
        assert connector_data["auth_provider"] in {"LOCAL", "HRIS_ASMX"}
        assert "hris_login_url" not in connector_data

        # 10. Audit log harus memuat aktivitas alur, termasuk target SOP dan arsip laporan.
        audit = api.get(
            "/baas/v1/audit-logs",
            headers=auth(wide_token),
            params={"limit": 200, "offset": 0},
        )
        assert audit.status_code == 200, body(audit)
        entries = {
            (entry["action"], entry["target_type"], entry["target_id"]): entry["id"]
            for entry in reversed(body(audit)["data"])
            if entry["company_id"] == target_company
            and entry["actor_user_id"] == login_user["id"]
            and entry["area_id"] == target_area
            and entry["outcome"] == "SUCCESS"
        }
        pdf_event = ("REPORT_ARCHIVED", "osc_report_archive", pdf_archive_id)
        switch_event = ("CONTEXT_SWITCH", "osc_company", target_company)
        assert {
            ("RESOURCE_CREATED", "osc_sop_document", document_id),
            ("SOP_ATTACHMENT_UPLOADED", "osc_sop_document", document_id),
            ("REPORT_ARCHIVED", "osc_report_archive", excel_archive_id),
            pdf_event,
            switch_event,
        } <= entries.keys()
        assert entries[switch_event] > entries[pdf_event]
