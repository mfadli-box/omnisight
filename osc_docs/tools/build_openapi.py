import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "technical" / "contracts"
OUT = BASE / "openapi.json"
perms_doc = json.loads((BASE / "permissions.json").read_text(encoding="utf-8"))

sub_by_code = {s["code"]: s for s in perms_doc["submodules"]}
perm_meta = {}
for s in perms_doc["submodules"]:
    for action in ("read", "post"):
        code = s["permissions"][action]
        if code:
            perm_meta[code] = s

routes = []

def add(method, path, tag, module, perms, scope, summary, *,
        security="session", body=None, body_required=True, list_view=False,
        company=True, csrf=None, idempotent=False, sensitive=None,
        approval=None, audit=None, binary=False, health=False, metrics=False):
    if csrf is None:
        csrf = method in ("POST", "PATCH", "PUT") and security in ("session", "cookie")
    if sensitive is None:
        sensitive = any(perm_meta.get(p, {}).get("sensitivity") in ("high", "critical") for p in perms)
        if any(p.startswith("A") and len(p) > 2 and p[2].isdigit() for p in perms):
            sensitive = True
    if approval is None:
        levels = ["none"]
        for p in perms:
            meta = perm_meta.get(p)
            if meta:
                levels.append(meta["approval"])
        approval = "dual_control" if "dual_control" in levels else "required" if "required" in levels else "policy" if "policy" in levels else "none"
    if method == "GET":
        approval = "none"
    if audit is None:
        audit = security != "public" and (sensitive or method in ("POST", "PATCH", "PUT", "DELETE"))
    routes.append({
        "method": method, "path": path, "tag": tag, "module": module,
        "perms": perms, "scope": scope, "summary": summary, "security": security,
        "body": body, "body_required": body_required, "list_view": list_view,
        "company": company, "csrf": csrf, "idempotent": idempotent,
        "sensitive": bool(sensitive), "approval": approval, "audit": audit,
        "binary": binary, "health": health, "metrics": metrics,
    })

def pair(path, tag, module, read_perm, post_perm, scope, summary, **kw):
    add("GET", path, tag, module, [read_perm] if read_perm else [], scope, f"List {summary}", list_view=True, **kw)
    if post_perm:
        add("POST", path, tag, module, [post_perm], scope, f"Create {summary}", **kw)

# Public
add("GET", "/api/v1/public/status", "Public", "PUB", [], ["public"], "Read public service status",
    security="public", company=False, audit=False)
add("GET", "/api/v1/public/pages/{slug}", "Public", "PUB", [], ["public"], "Read a published public page",
    security="public", company=False, audit=False)
add("GET", "/api/v1/public/articles", "Public", "PUB", [], ["public"], "List published public articles",
    security="public", company=False, list_view=True, audit=False)
add("GET", "/api/v1/public/articles/{slug}", "Public", "PUB", [], ["public"], "Read a published public article",
    security="public", company=False, audit=False)

# Auth
add("POST", "/api/v1/auth/login", "Auth", "AUTH", [], ["public"], "Sign in with local credentials",
    security="public", company=False, csrf=False, body="LoginRequest", sensitive=True, approval="none")
add("POST", "/api/v1/auth/login/hris", "Auth", "AUTH", [], ["public"], "Sign in through the HRIS bridge",
    security="public", company=False, csrf=False, body="HrisLoginRequest", sensitive=True, approval="none")
add("POST", "/api/v1/auth/refresh", "Auth", "AUTH", [], ["session"], "Rotate the refresh token",
    security="cookie", company=False, csrf=True, body=False)
add("POST", "/api/v1/auth/logout", "Auth", "AUTH", [], ["session"], "Revoke the current session",
    security="cookie", company=False, body=False)
add("GET", "/api/v1/auth/me", "Auth", "AUTH", ["session:self"], ["self"], "Read the current profile, permissions, and scope",
    company=False)
add("PATCH", "/api/v1/auth/me", "Auth", "AUTH", ["session:self"], ["self"], "Update own profile and locale",
    company=False, body="ProfileUpdateRequest")
add("POST", "/api/v1/auth/context", "Auth", "AUTH", [], ["self"], "Select the active company and area",
    company=False, body="ContextRequest")
add("GET", "/api/v1/auth/sessions", "Auth", "AUTH", ["session:self"], ["self"], "List own sessions",
    company=False)
add("POST", "/api/v1/auth/sessions/{id}/revoke", "Auth", "AUTH", ["AB05:post", "session:self"],
    ["self", "company"], "Revoke own session or another user's session", company=False, sensitive=True, approval="none")
add("POST", "/api/v1/auth/mfa/enroll", "Auth", "AUTH", ["session:self"], ["self"], "Start MFA enrollment",
    company=False, body=False, sensitive=True, approval="none")
add("POST", "/api/v1/auth/mfa/verify", "Auth", "AUTH", ["session:self"], ["self"], "Verify an MFA challenge",
    company=False, body="MfaVerifyRequest", sensitive=True, approval="none")

# Dashboard
add("GET", "/api/v1/dashboard/summary", "Dashboard", "AA", ["AA:read"], ["company", "area", "self"], "Read dashboard summary cards", list_view=False)
add("GET", "/api/v1/dashboard/health", "Dashboard", "AA", ["AA:read"], ["company", "global"], "Read integration and component health")
add("GET", "/api/v1/dashboard/activity", "Dashboard", "AA", ["AA:read"], ["company", "area"], "Read recent audit activity")
add("GET", "/api/v1/dashboard/tasks", "Dashboard", "AA", ["AA:read"], ["company", "area", "self"], "Read tickets, approvals, and reviews assigned to the user")

# Identity
add("GET", "/api/v1/identity/companies", "Identity", "AB", ["AB:read"], ["company", "global"], "List companies visible to the user", list_view=True)
add("POST", "/api/v1/identity/companies", "Identity", "AB", ["AB:post"], ["global"], "Create a company", sensitive=True, approval="none")
add("GET", "/api/v1/identity/areas", "Identity", "AB", ["AB:read"], ["company", "area"], "List areas", list_view=True)
add("POST", "/api/v1/identity/areas", "Identity", "AB", ["AB:post"], ["company"], "Create an area")
add("GET", "/api/v1/identity/users", "Identity", "AB", ["AB02:read"], ["company"], "List users in the company", list_view=True)
add("POST", "/api/v1/identity/users", "Identity", "AB", ["AB02:post"], ["company"], "Invite or create a user")
add("GET", "/api/v1/identity/memberships", "Identity", "AB", ["AB02:read"], ["company"], "List company memberships", list_view=True)
add("POST", "/api/v1/identity/memberships", "Identity", "AB", ["AB02:post"], ["company"], "Create or update a membership")
add("GET", "/api/v1/identity/roles", "Identity", "AB", ["AB03:read"], ["company"], "List roles and permissions", list_view=True)
add("POST", "/api/v1/identity/roles", "Identity", "AB", ["AB03:post"], ["company"], "Create or update a role")
add("GET", "/api/v1/identity/hris/connections", "Identity", "AB", ["AB04:read"], ["company"], "List HRIS connections", list_view=True)
add("POST", "/api/v1/identity/hris/connections", "Identity", "AB", ["AB04:post"], ["company"], "Create or update an HRIS connection")
add("GET", "/api/v1/identity/hris/rules", "Identity", "AB", ["AB04:read"], ["company"], "List HRIS login rules", list_view=True)
add("POST", "/api/v1/identity/hris/rules", "Identity", "AB", ["AB04:post"], ["company"], "Create or update an HRIS login rule")
add("POST", "/api/v1/identity/hris/rules/{id}/test", "Identity", "AB", ["AB04:post"], ["company"], "Test an HRIS rule with a safe payload",
    body="GenericObject", body_required=False, sensitive=True, approval="policy")
add("GET", "/api/v1/identity/login-attempts", "Identity", "AB", ["AB06:read"], ["company"], "List login attempts", list_view=True)
add("GET", "/api/v1/identity/directory", "Identity", "AB", ["AB:read"], ["company", "area"], "Search the company directory within scope", list_view=True)

# Assets
pair("/api/v1/assets/categories", "Assets", "AC", "AC:read", "AC:post", ["company", "area"], "asset categories")
pair("/api/v1/assets/models", "Assets", "AC", "AC:read", "AC:post", ["company", "area"], "asset models")
pair("/api/v1/assets/assets", "Assets", "AC", "AC:read", "AC:post", ["area"], "assets")
add("GET", "/api/v1/assets/assets/{id}", "Assets", "AC", ["AC:read"], ["area"], "Read an asset")
add("POST", "/api/v1/assets/assets/{id}/checkout", "Assets", "AC", ["AC:post"], ["area"], "Check out an asset", body="GenericObject")
add("POST", "/api/v1/assets/assets/{id}/checkin", "Assets", "AC", ["AC:post"], ["area"], "Check in an asset", body="GenericObject")
add("POST", "/api/v1/assets/assets/{id}/move", "Assets", "AC", ["AC:post"], ["area"], "Move an asset", body="GenericObject")
add("GET", "/api/v1/assets/assets/{id}/history", "Assets", "AC", ["AC:read"], ["area"], "Read asset assignment and movement history")
add("POST", "/api/v1/assets/assets/{id}/qr/rotate", "Assets", "AC", ["AC:post"], ["area"], "Rotate the asset QR token", body=False)
add("GET", "/api/v1/assets/reports", "Assets", "AC", ["AC:read"], ["company", "area"], "Read asset reports", list_view=True)
add("POST", "/api/v1/assets/reports/export", "Assets", "AC", ["AC:post"], ["company", "area"], "Export an asset report",
    body="ExportRequest", binary=True)
add("GET", "/api/v1/assets/mine", "Assets", "AC", ["session:self"], ["self"], "List assets assigned to the current user",
    list_view=True)

# Network
pair("/api/v1/network/devices", "Network", "AD", "AD:read", "AD:post", ["area"], "network devices")
pair("/api/v1/network/racks", "Network", "AD", "AD:read", "AD:post", ["area"], "racks")
pair("/api/v1/network/interfaces", "Network", "AD", "AD:read", "AD:post", ["area"], "interfaces")
pair("/api/v1/network/prefixes", "Network", "AD", "AD:read", "AD:post", ["area"], "IP prefixes")
pair("/api/v1/network/ip-addresses", "Network", "AD", "AD:read", "AD:post", ["area"], "IP addresses")
pair("/api/v1/network/vlans", "Network", "AD", "AD:read", "AD:post", ["area"], "VLANs")
pair("/api/v1/network/links", "Network", "AD", "AD:read", "AD:post", ["area"], "device links")
pair("/api/v1/network/circuits", "Network", "AD", "AD:read", "AD:post", ["area"], "circuits")
pair("/api/v1/network/routers", "Network", "AD", "AD:read", "AD:post", ["area"], "MikroTik routers")
add("POST", "/api/v1/network/routers/{id}/snapshot", "Network", "AD", ["AD07:post"], ["area"],
    "Take a RouterOS configuration snapshot", body=False)
pair("/api/v1/network/changes", "Network", "AD", "AD06:read", "AD06:post", ["area"], "network changes")
add("POST", "/api/v1/network/changes/{id}/approve", "Network", "AD", ["AD06:post"], ["area"],
    "Approve a network change", body="GenericObject", body_required=False, approval="none")
add("POST", "/api/v1/network/changes/{id}/execute", "Network", "AD", ["AD06:post"], ["area"],
    "Execute an approved network change", body="GenericObject", idempotent=True)
add("POST", "/api/v1/network/changes/{id}/rollback", "Network", "AD", ["AD06:post"], ["area"],
    "Roll back a network change", body="GenericObject", idempotent=True, approval="policy")
pair("/api/v1/network/integrations", "Network", "AD", "AD:read", "AD:post", ["company"], "network integrations")
add("POST", "/api/v1/network/integrations/{id}/sync", "Network", "AD", ["AD:post"], ["company"],
    "Synchronize a network integration", body=False, idempotent=True)

# Monitoring
add("GET", "/api/v1/monitoring/hosts", "Monitoring", "AE", ["AE:read"], ["area"], "List monitored hosts", list_view=True)
add("GET", "/api/v1/monitoring/agents", "Monitoring", "AE", ["AE:read"], ["area"], "List agents", list_view=True)
add("GET", "/api/v1/monitoring/agents/{id}", "Monitoring", "AE", ["AE:read"], ["area"], "Read an agent")
add("POST", "/api/v1/monitoring/agents/enrollment-tokens", "Monitoring", "AE", ["AE:post"], ["area"],
    "Create a one-time agent enrollment token", body="GenericObject", sensitive=True, approval="policy")
add("POST", "/api/v1/monitoring/agents/{id}/revoke", "Monitoring", "AE", ["AE:post"], ["area"],
    "Revoke an agent", body="GenericObject", body_required=False, sensitive=True, approval="policy")
add("GET", "/api/v1/monitoring/agents/{id}/metrics", "Monitoring", "AE", ["AE:read"], ["area"], "Read agent metrics", list_view=True)
pair("/api/v1/monitoring/alert-rules", "Monitoring", "AE", "AE:read", "AE:post", ["area"], "alert rules")
add("GET", "/api/v1/monitoring/alerts", "Monitoring", "AE", ["AE:read"], ["area"], "List alerts", list_view=True)
add("POST", "/api/v1/monitoring/alerts/{id}/ack", "Monitoring", "AE", ["AE:post"], ["area"], "Acknowledge an alert",
    body="GenericObject", body_required=False)
pair("/api/v1/monitoring/incidents", "Monitoring", "AE", "AE:read", "AE:post", ["area"], "incidents")
pair("/api/v1/monitoring/integrations", "Monitoring", "AE", "AE:read", "AE:post", ["company"], "monitoring integrations")
add("POST", "/api/v1/monitoring/integrations/{id}/sync", "Monitoring", "AE", ["AE:post"], ["company"],
    "Synchronize a monitoring integration", body=False, idempotent=True)
add("GET", "/api/v1/monitoring/security-events", "Monitoring", "AE", ["AE06:read"], ["company"], "List security events", list_view=True)
add("POST", "/api/v1/monitoring/security-events/{id}/triage", "Monitoring", "AE", ["AE06:post"], ["company"],
    "Triage a security event", body="GenericObject", approval="none")
add("GET", "/api/v1/monitoring/retention", "Monitoring", "AE", ["AE:read"], ["company"], "Read metric retention policy")
add("PUT", "/api/v1/monitoring/retention", "Monitoring", "AE", ["AE:post"], ["company"], "Update metric retention policy",
    body="GenericObject")

# Containers
pair("/api/v1/containers/endpoints", "Containers", "AF", "AF:read", "AF:post", ["area"], "container endpoints")
pair("/api/v1/containers/stacks", "Containers", "AF", "AF:read", "AF:post", ["area"], "container stacks")
add("GET", "/api/v1/containers/stacks/{id}", "Containers", "AF", ["AF:read"], ["area"], "Read a container stack")
add("POST", "/api/v1/containers/stacks/{id}/plan", "Containers", "AF", ["AF04:post"], ["area"],
    "Create a deployment plan", body="GenericObject", approval="none")
add("POST", "/api/v1/containers/stacks/{id}/deploy", "Containers", "AF", ["AF04:post"], ["area"],
    "Deploy a container stack", body="GenericObject", idempotent=True)
add("POST", "/api/v1/containers/stacks/{id}/rollback", "Containers", "AF", ["AF04:post"], ["area"],
    "Roll back a container stack", body="GenericObject", idempotent=True)
add("GET", "/api/v1/containers/actions", "Containers", "AF", ["AF:read"], ["area"], "List container actions", list_view=True)
add("POST", "/api/v1/containers/actions", "Containers", "AF", ["AF05:post"], ["area"],
    "Request a container maintenance action", body="GenericObject", idempotent=True)
add("POST", "/api/v1/containers/actions/{id}/approve", "Containers", "AF", ["AF04:post"], ["area"],
    "Approve a container action", body="GenericObject", body_required=False, approval="none")
add("GET", "/api/v1/containers/hosts", "Containers", "AF", ["AF:read"], ["area"], "Read container host overview", list_view=True)

# Edge
pair("/api/v1/edge/domains", "Edge", "AG", "AG:read", "AG:post", ["company"], "domains")
pair("/api/v1/edge/certificates", "Edge", "AG", "AG:read", "AG:post", ["company"], "certificates")
pair("/api/v1/edge/proxy-hosts", "Edge", "AG", "AG:read", "AG:post", ["company"], "proxy hosts")
add("POST", "/api/v1/edge/proxy-hosts/{id}/apply", "Edge", "AG", ["AG04:post"], ["company", "area"],
    "Apply a validated proxy configuration", body="GenericObject", idempotent=True)
pair("/api/v1/edge/nodes", "Edge", "AG", "AG:read", "AG:post", ["company"], "edge nodes")

# Backups
pair("/api/v1/backups/sources", "Backup", "AH", "AH:read", "AH:post", ["company", "area"], "configuration sources")
pair("/api/v1/backups/schedules", "Backup", "AH", "AH:read", "AH:post", ["company", "area"], "backup schedules")
add("GET", "/api/v1/backups/backups", "Backup", "AH", ["AH:read"], ["company", "area"], "List backups", list_view=True)
add("GET", "/api/v1/backups/backups/{id}/diff", "Backup", "AH", ["AH:read"], ["company", "area"], "Read a backup diff")
add("GET", "/api/v1/backups/verifications", "Backup", "AH", ["AH05:read"], ["company"], "List backup verifications", list_view=True)
add("POST", "/api/v1/backups/backups/{id}/verify", "Backup", "AH", ["AH05:post"], ["company"],
    "Verify a backup in an isolated environment", body="GenericObject", body_required=False, approval="none")
add("POST", "/api/v1/backups/backups/{id}/restore", "Backup", "AH", ["AH04:post"], ["company", "area"],
    "Request a backup restore", body="GenericObject", idempotent=True)
add("POST", "/api/v1/backups/restores/{id}/approve", "Backup", "AH", ["AH04:post"], ["company", "area"],
    "Approve a backup restore", body="GenericObject", body_required=False, approval="none")

# Secure access
pair("/api/v1/access/targets", "Secure Access", "AI", "AI:read", "AI:post", ["company", "area"], "access targets")
add("GET", "/api/v1/access/requests", "Secure Access", "AI", ["AI02:read"], ["area"], "List access requests for approval", list_view=True)
add("POST", "/api/v1/access/requests", "Secure Access", "AI", ["AI:post"], ["self", "area"],
    "Create an access request", body="GenericObject", sensitive=True, approval="none")
add("POST", "/api/v1/access/requests/{id}/approve", "Secure Access", "AI", ["AI02:post"], ["area"],
    "Approve or reject an access request", body="GenericObject", approval="none")
add("GET", "/api/v1/access/requests/mine", "Secure Access", "AI", ["AI:post"], ["self"],
    "List the current user's access requests", list_view=True)
add("GET", "/api/v1/access/sessions", "Secure Access", "AI", ["AI:read"], ["area"], "List active bastion sessions", list_view=True)
add("POST", "/api/v1/access/sessions/{id}/terminate", "Secure Access", "AI", ["AI:post"], ["area"],
    "Terminate an active bastion session", body="GenericObject", body_required=False, approval="none")
pair("/api/v1/access/policies", "Secure Access", "AI", "AI05:read", "AI05:post", ["company"], "access policies")

# Service desk
pair("/api/v1/service-desk/tickets", "Service Desk", "AJ", "AJ:read", "AJ:post", ["self", "area"], "tickets")
add("GET", "/api/v1/service-desk/tickets/mine", "Service Desk", "AJ", ["AJ:read"], ["self"],
    "List the current user's tickets", list_view=True)
add("POST", "/api/v1/service-desk/tickets/{id}/comments", "Service Desk", "AJ", ["AJ:post"], ["self", "area"],
    "Add a ticket comment", body="GenericObject")
pair("/api/v1/service-desk/categories", "Service Desk", "AJ", "AJ:read", "AJ:post", ["company"], "ticket categories")
pair("/api/v1/service-desk/sla-policies", "Service Desk", "AJ", "AJ:read", "AJ:post", ["company"], "SLA policies")
pair("/api/v1/service-desk/contracts", "Service Desk", "AJ", "AJ:read", "AJ:post", ["company"], "contracts")
pair("/api/v1/service-desk/kb", "Service Desk", "AJ", "AJ:read", "AJ:post", ["company"], "knowledge base articles")
add("GET", "/api/v1/service-desk/reports", "Service Desk", "AJ", ["AJ:read"], ["company", "area"], "Read service desk reports", list_view=True)

# Content
pair("/api/v1/content/articles", "Content", "AK", "AK:read", "AK:post", ["company", "public"], "articles")
pair("/api/v1/content/pages", "Content", "AK", "AK:read", "AK:post", ["company", "public"], "pages")
pair("/api/v1/content/notification-templates", "Content", "AK", "AK:read", "AK:post", ["company"], "notification templates")
add("GET", "/api/v1/content/notifications", "Content", "AK", ["AK:read"], ["company"], "List notifications", list_view=True)
add("POST", "/api/v1/content/notifications/{id}/read", "Content", "AK", ["AK:post"], ["self"], "Mark a notification as read", body=False)
add("GET", "/api/v1/content/preferences", "Content", "AK", ["AK:read"], ["self"], "Read own notification preferences")
add("PATCH", "/api/v1/content/preferences", "Content", "AK", ["AK:post"], ["self"], "Update own notification preferences",
    body="GenericObject")

# Audit
add("GET", "/api/v1/audit/events", "Audit", "AL", ["AL:read"], ["company"], "List audit events", list_view=True)
add("GET", "/api/v1/audit/logins", "Audit", "AL", ["AL:read"], ["company"], "List login and access events", list_view=True)
add("GET", "/api/v1/audit/security-events", "Audit", "AL", ["AL:read"], ["company"], "List security events", list_view=True)
add("POST", "/api/v1/audit/security-events/{id}/triage", "Audit", "AL", ["AL:post"], ["company"],
    "Triage a security event", body="GenericObject")
pair("/api/v1/audit/access-reviews", "Audit", "AL", "AL04:read", "AL04:post", ["company"], "access reviews")
add("POST", "/api/v1/audit/access-reviews/{id}/items/{item_id}/decide", "Audit", "AL", ["AL04:post"], ["company"],
    "Decide an access review item", body="GenericObject")
add("POST", "/api/v1/audit/export", "Audit", "AL", ["AL05:post"], ["company"],
    "Export audit data with approval", body="ExportRequest", binary=True, idempotent=True)
add("GET", "/api/v1/audit/retention", "Audit", "AL", ["AL05:read"], ["company"], "Read audit retention policy")
add("PUT", "/api/v1/audit/retention", "Audit", "AL", ["AL05:post"], ["company"], "Update audit retention policy",
    body="GenericObject")

# Platform
pair("/api/v1/platform/integrations", "Platform", "AM", "AM:read", "AM:post", ["company"], "platform integrations")
add("POST", "/api/v1/platform/integrations/{id}/test", "Platform", "AM", ["AM:post"], ["company"],
    "Test a platform integration", body=False)
add("GET", "/api/v1/platform/health", "Platform", "AM", ["AM:read"], ["company"], "Read platform integration health")
pair("/api/v1/platform/credentials", "Platform", "AM", "AM02:read", "AM02:post", ["company"], "credential references")
add("POST", "/api/v1/platform/credentials/{id}/test", "Platform", "AM", ["AM02:post"], ["company"],
    "Test a credential reference", body=False, approval="policy")
pair("/api/v1/platform/webhooks", "Platform", "AM", "AM03:read", "AM03:post", ["company"], "webhooks")
pair("/api/v1/platform/api-keys", "Platform", "AM", "AM03:read", "AM03:post", ["company"], "API keys")
pair("/api/v1/platform/feature-flags", "Platform", "AM", "AM:read", "AM:post", ["company"], "feature flags")
pair("/api/v1/platform/settings", "Platform", "AM", "AM:read", "AM:post", ["company"], "platform settings")
pair("/api/v1/platform/jobs", "Platform", "AM", "AM:read", "AM:post", ["company"], "scheduled jobs")
add("GET", "/api/v1/platform/impersonation", "Platform", "AM", ["AM08:read"], ["global"], "List impersonation sessions", list_view=True)
add("POST", "/api/v1/platform/impersonation", "Platform", "AM", ["AM08:post"], ["global"],
    "Start an impersonation session", body="ImpersonationRequest", idempotent=True, approval="none")
add("POST", "/api/v1/platform/impersonation/{id}/end", "Platform", "AM", ["AM08:post"], ["global"],
    "End an impersonation session", body=False)

# Internal
internal = [
    ("POST", "/internal/v1/ingest/metrics", "Ingest signed metric batches"),
    ("POST", "/internal/v1/ingest/heartbeat", "Ingest an agent heartbeat"),
    ("POST", "/internal/v1/jobs/claim", "Claim a scheduled job lease"),
    ("POST", "/internal/v1/jobs/{id}/complete", "Complete a scheduled job"),
    ("POST", "/internal/v1/outbox/claim", "Claim outbox events"),
    ("POST", "/internal/v1/outbox/{id}/complete", "Complete an outbox event"),
    ("POST", "/internal/v1/agent/enroll", "Enroll an agent and issue a certificate"),
    ("GET", "/internal/v1/agent/{id}/config", "Read agent configuration"),
]
for method, path, summary in internal:
    add(method, path, "Internal", "INTERNAL", [], ["internal"], summary,
        security="internal", company=False, audit=False, body="GenericObject" if method == "POST" else None,
        body_required=method == "POST", idempotent=method == "POST")
add("GET", "/internal/healthz", "Internal", "INTERNAL", [], ["internal"], "Internal health check",
    security="internal", company=False, audit=False, health=True)
add("GET", "/internal/metrics", "Internal", "INTERNAL", [], ["internal"], "Prometheus metrics",
    security="internal", company=False, audit=False, metrics=True)

# Explicit metadata overrides where inference from permission sensitivity is wrong.
overrides = {
    ("POST", "/api/v1/network/changes"): {"approval": "none"},
    ("POST", "/api/v1/network/routers"): {"sensitive": True},
    ("POST", "/api/v1/containers/endpoints"): {"sensitive": True},
    ("POST", "/api/v1/edge/certificates"): {"sensitive": True},
    ("POST", "/api/v1/access/targets"): {"sensitive": True},
    ("POST", "/api/v1/platform/integrations"): {"sensitive": True},
    ("POST", "/api/v1/platform/webhooks"): {"sensitive": True},
    ("POST", "/api/v1/service-desk/contracts"): {"sensitive": True},
    ("POST", "/api/v1/audit/security-events/{id}/triage"): {"sensitive": True},
    ("POST", "/api/v1/access/sessions/{id}/terminate"): {"sensitive": True},
    ("GET", "/api/v1/network/routers"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/containers/endpoints"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/edge/certificates"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/access/targets"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/access/sessions"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/platform/integrations"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/platform/webhooks"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/service-desk/contracts"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/backups/backups"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/backups/backups/{id}/diff"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/audit/events"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/audit/logins"): {"sensitive": True, "audit": True},
    ("GET", "/api/v1/audit/security-events"): {"sensitive": True, "audit": True},
}
seen = set()
for route in routes:
    key = (route["method"], route["path"])
    if key in overrides:
        seen.add(key)
        route.update(overrides[key])
missing_overrides = set(overrides) - seen
assert not missing_overrides, f"override targets not found: {sorted(missing_overrides)}"

# Path parameters and operation IDs
def path_params(path):
    out = []
    for part in path.strip("/").split("/"):
        if part.startswith("{") and part.endswith("}"):
            name = part[1:-1]
            out.append({
                "name": name, "in": "path", "required": True,
                "schema": {"type": "string", "format": "uuid"} if name != "slug" else {"type": "string"},
                "description": "URL slug" if name == "slug" else "Resource UUID",
            })
    return out

def scope_name(scope):
    return "".join(s.capitalize() for s in scope)

def operation_id(method, path):
    parts = [p for p in path.strip("/").split("/") if not p.startswith("{")]
    parts = [p for p in parts if p not in ("api", "v1", "internal")]
    name = "".join(p.replace("-", " ").replace("_", " ").title().replace(" ", "") for p in parts)
    if "{" in path:
        name += "ById"
    return method.lower() + name

def parameters(route):
    params = []
    if route["security"] != "public":
        params.append({"$ref": "#/components/parameters/AcceptLanguage"})
    else:
        params.append({"$ref": "#/components/parameters/AcceptLanguage"})
    if route["company"]:
        params.append({"$ref": "#/components/parameters/CompanyId"})
    if "area" in route["scope"]:
        params.append({"$ref": "#/components/parameters/AreaId"})
    if route["csrf"]:
        params.append({"$ref": "#/components/parameters/CsrfToken"})
    if route["idempotent"]:
        params.append({"$ref": "#/components/parameters/IdempotencyKeyRequired"})
    if route["method"] in ("PATCH", "PUT"):
        params.append({"$ref": "#/components/parameters/IfMatch"})
    if route["list_view"]:
        params.append({"$ref": "#/components/parameters/Limit"})
        params.append({"$ref": "#/components/parameters/Cursor"})
        params.append({"$ref": "#/components/parameters/Q"})
    params.extend(path_params(route["path"]))
    return params

def request_body(route):
    if route["body"] is None:
        if route["method"] in ("POST", "PATCH", "PUT"):
            schema = "GenericObject"
        else:
            return None
    elif route["body"] is False:
        return None
    else:
        schema = route["body"]
    return {
        "required": route["body_required"],
        "content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{schema}"}}},
    }

def responses(route):
    if route["health"]:
        return {
            "200": {
                "description": "Healthy",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Health"}}},
            },
            "503": {
                "description": "Unhealthy",
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Health"}}},
            },
        }
    if route["metrics"]:
        return {
            "200": {
                "description": "Prometheus text exposition",
                "content": {"text/plain": {"schema": {"type": "string"}}},
            }
        }
    if route["binary"]:
        return {"200": {"$ref": "#/components/responses/BinaryOrEnvelope"}}
    return {"200": {"$ref": "#/components/responses/Envelope"}}

security_obj = {
    "public": [],
    "cookie": [{"cookieAuth": []}],
    "session": [{"cookieAuth": []}, {"bearerAuth": []}],
    "internal": [{"internalServiceToken": []}],
}

paths = {}
seen_ops = set()
for r in routes:
    oid = operation_id(r["method"], r["path"])
    if oid in seen_ops:
        raise SystemExit(f"duplicate operationId: {oid} ({r['method']} {r['path']})")
    seen_ops.add(oid)
    operation = {
        "tags": [r["tag"]],
        "summary": r["summary"],
        "operationId": oid,
        "security": security_obj[r["security"]],
        "parameters": parameters(r),
        "responses": responses(r),
        "x-module": r["module"],
        "x-permission": sorted(set(r["perms"])),
        "x-scope": r["scope"],
        "x-sensitive": r["sensitive"],
        "x-approval": r["approval"],
        "x-idempotent": r["idempotent"],
        "x-audit": r["audit"],
    }
    rb = request_body(r)
    if rb:
        operation["requestBody"] = rb
    paths.setdefault(r["path"], {})[r["method"].lower()] = operation

tags = [
    ("Public", "Unauthenticated public pages and status."),
    ("Auth", "Authentication, session, context, and MFA."),
    ("Dashboard", "Read-only aggregates scoped to the user."),
    ("Identity", "Companies, areas, users, memberships, roles, HRIS, and directory."),
    ("Assets", "Asset catalog, assignments, movements, QR, and reports."),
    ("Network", "Sites, devices, IPAM, MikroTik, firewall changes, and integrations."),
    ("Monitoring", "Hosts, agents, metrics, alerts, incidents, and security events."),
    ("Containers", "Container endpoints, stacks, deploy, rollback, and maintenance."),
    ("Edge", "Domains, certificates, proxy hosts, Nginx configuration, and edge nodes."),
    ("Backup", "Configuration sources, schedules, snapshots, verification, and restore."),
    ("Secure Access", "Bastion targets, access requests, sessions, and policies."),
    ("Service Desk", "Tickets, comments, SLA, contracts, knowledge base, and reports."),
    ("Content", "Articles, pages, notification templates, deliveries, and preferences."),
    ("Audit", "Audit trail, logins, security events, access reviews, export, and retention."),
    ("Platform", "Integrations, credentials, webhooks, API keys, flags, settings, jobs, and impersonation."),
    ("Internal", "Internal services only; mTLS and short-lived service tokens."),
]

doc = {
    "openapi": "3.1.0",
    "info": {
        "title": "OmniSight API",
        "version": "0.6.0",
        "summary": "Executable API contract derived from the OmniSight documentation set.",
        "description": (
            "All business outcomes use HTTP 200 with the envelope {ok, code, message, data, meta, errors}. "
            "HTTP 403 is never returned. Handled application errors never return HTTP 5xx; only "
            "/internal/healthz reports a real 503. Authorization and scope are enforced by the server on every request. "
            "x-permission, x-scope, x-approval, x-idempotent, and x-audit are normative metadata. "
            "Error codes are defined in kode-error.json; messages are localized to en and id."
        ),
        "contact": {"name": "OmniSight Platform Team"},
        "license": {"name": "Proprietary"},
    },
    "servers": [{"url": "/", "description": "Same-origin edge"}],
    "tags": [{"name": name, "description": desc} for name, desc in tags],
    "security": [{"cookieAuth": []}, {"bearerAuth": []}],
    "paths": paths,
    "components": {
        "securitySchemes": {
            "cookieAuth": {
                "type": "apiKey", "in": "cookie", "name": "osc_session",
                "description": "HttpOnly, Secure, SameSite=Lax session cookie. Cookie name is finalized in WP-03.",
            },
            "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
            "internalServiceToken": {
                "type": "http", "scheme": "bearer",
                "description": "Short-lived internal service token; mTLS is required in addition.",
            },
        },
        "parameters": {
            "CompanyId": {
                "name": "X-Company-Id", "in": "header", "required": False,
                "description": "Active company. Validated against membership.",
                "schema": {"type": "string", "format": "uuid"},
            },
            "AreaId": {
                "name": "X-Area-Id", "in": "header", "required": False,
                "description": "Active area. Validated as a descendant of the user's scope.",
                "schema": {"type": "string", "format": "uuid"},
            },
            "CsrfToken": {
                "name": "X-CSRF-Token", "in": "header", "required": False,
                "description": "Required for browser POST requests.",
                "schema": {"type": "string"},
            },
            "IdempotencyKeyRequired": {
                "name": "Idempotency-Key", "in": "header", "required": True,
                "description": "Required for external actions. Reusing a key with a different body returns AA00-00-0007.",
                "schema": {"type": "string", "maxLength": 128},
            },
            "IfMatch": {
                "name": "If-Match", "in": "header", "required": False,
                "description": "Optimistic concurrency version.",
                "schema": {"type": "string"},
            },
            "AcceptLanguage": {
                "name": "Accept-Language", "in": "header", "required": False,
                "description": "Supported values: en (default), id. Falls back to the user locale, company locale, then en.",
                "schema": {"type": "string", "enum": ["en", "id"]},
            },
            "Limit": {
                "name": "limit", "in": "query", "required": False,
                "schema": {"type": "integer", "minimum": 1, "maximum": 200, "default": 25},
            },
            "Cursor": {
                "name": "cursor", "in": "query", "required": False,
                "schema": {"type": "string"},
            },
            "Q": {
                "name": "q", "in": "query", "required": False,
                "schema": {"type": "string", "maxLength": 200},
            },
        },
        "headers": {
            "XRequestId": {
                "description": "Request correlation ID.",
                "schema": {"type": "string", "format": "uuid"},
            },
            "ContentLanguage": {
                "description": "Locale of the response message.",
                "schema": {"type": "string", "enum": ["en", "id"]},
            },
        },
        "responses": {
            "Envelope": {
                "description": (
                    "Business response. HTTP 200 is used for success, validation, authorization denial, "
                    "out-of-scope resources, conflicts, rate limits, and handled internal errors."
                ),
                "headers": {
                    "X-Request-Id": {"$ref": "#/components/headers/XRequestId"},
                    "Content-Language": {"$ref": "#/components/headers/ContentLanguage"},
                    "Cache-Control": {"schema": {"type": "string"}},
                },
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Envelope"}}},
            },
            "BinaryOrEnvelope": {
                "description": "Binary download on success, or a JSON envelope on failure. Both use HTTP 200.",
                "headers": {
                    "X-Request-Id": {"$ref": "#/components/headers/XRequestId"},
                    "Content-Language": {"$ref": "#/components/headers/ContentLanguage"},
                },
                "content": {
                    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}},
                    "application/json": {"schema": {"$ref": "#/components/schemas/Envelope"}},
                },
            },
        },
        "schemas": {
            "Envelope": {
                "type": "object",
                "required": ["ok", "code", "message", "data", "meta", "errors"],
                "additionalProperties": False,
                "properties": {
                    "ok": {"type": "boolean"},
                    "code": {
                        "type": "string",
                        "pattern": "^(AA00-00-[0-9]{4}|A[A-M]-[0-9]{2}-[0-9]{4})$",
                        "description": "Stable error or success code. Never localized.",
                    },
                    "message": {"type": "string", "description": "Localized, client-safe message."},
                    "data": {"description": "Payload, list page, or null on failure."},
                    "meta": {"$ref": "#/components/schemas/Meta"},
                    "errors": {"type": "array", "items": {"$ref": "#/components/schemas/ErrorDetail"}},
                },
            },
            "Meta": {
                "type": "object",
                "required": ["request_id", "timestamp"],
                "additionalProperties": True,
                "properties": {
                    "request_id": {"type": "string", "format": "uuid"},
                    "timestamp": {"type": "string", "format": "date-time"},
                    "company_id": {"type": ["string", "null"], "format": "uuid"},
                    "area_id": {"type": ["string", "null"], "format": "uuid"},
                    "next_cursor": {"type": ["string", "null"]},
                    "has_more": {"type": "boolean"},
                    "retry_after_seconds": {"type": "integer", "minimum": 1},
                    "locale": {"type": "string", "enum": ["en", "id"]},
                },
            },
            "ErrorDetail": {
                "type": "object",
                "required": ["field", "code", "reason"],
                "additionalProperties": False,
                "properties": {
                    "field": {"type": "string"},
                    "code": {"type": "string", "description": "Stable field error code from kode-error.json."},
                    "reason": {"type": "string", "description": "Localized, safe explanation."},
                },
            },
            "LoginRequest": {
                "type": "object",
                "required": ["company_code", "email", "password"],
                "additionalProperties": False,
                "properties": {
                    "company_code": {"type": "string"},
                    "email": {"type": "string", "format": "email"},
                    "password": {"type": "string", "writeOnly": True},
                },
            },
            "HrisLoginRequest": {
                "type": "object",
                "required": ["company_code", "identifier", "password"],
                "additionalProperties": False,
                "properties": {
                    "company_code": {"type": "string"},
                    "identifier": {"type": "string"},
                    "password": {"type": "string", "writeOnly": True},
                },
            },
            "ContextRequest": {
                "type": "object",
                "required": ["company_id"],
                "additionalProperties": False,
                "properties": {
                    "company_id": {"type": "string", "format": "uuid"},
                    "area_id": {"type": ["string", "null"], "format": "uuid"},
                },
            },
            "MfaVerifyRequest": {
                "type": "object",
                "required": ["challenge_id", "code"],
                "additionalProperties": False,
                "properties": {
                    "challenge_id": {"type": "string"},
                    "code": {"type": "string", "pattern": "^[0-9]{6,8}$"},
                },
            },
            "ProfileUpdateRequest": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "display_name": {"type": "string", "maxLength": 160},
                    "locale": {"type": "string", "enum": ["en", "id"]},
                },
            },
            "ImpersonationRequest": {
                "type": "object",
                "required": ["target_user_id", "reason"],
                "additionalProperties": False,
                "properties": {
                    "target_user_id": {"type": "string", "format": "uuid"},
                    "reason": {"type": "string", "minLength": 10, "maxLength": 500},
                    "ticket_ref": {"type": ["string", "null"], "maxLength": 120},
                    "duration_minutes": {"type": "integer", "minimum": 1, "maximum": 60, "default": 30},
                },
            },
            "ExportRequest": {
                "type": "object",
                "required": ["format", "reason"],
                "additionalProperties": False,
                "properties": {
                    "format": {"type": "string", "enum": ["csv", "json"]},
                    "reason": {"type": "string", "minLength": 10, "maxLength": 500},
                    "filters": {"type": "object", "additionalProperties": True},
                },
            },
            "Health": {
                "type": "object",
                "required": ["status"],
                "additionalProperties": True,
                "properties": {
                    "status": {"type": "string", "enum": ["ok", "degraded", "unhealthy"]},
                    "components": {"type": "object", "additionalProperties": {"type": "string"}},
                },
            },
            "GenericObject": {"type": "object", "additionalProperties": True},
        },
    },
    "x-contract": {
        "status": "approved",
        "version": "0.6.0",
        "error_registry": "kode-error.json",
        "permission_registry": "permissions.json",
        "validate_with": "validate_contracts.py",
        "notes": [
            "Documentation 0.6 and this contract were approved at G0 on 2026-10-30.",
            "DTO details not listed here follow the module documentation and are added with each WP.",
            "No operation returns HTTP 403 or an application HTTP 5xx.",
        ],
    },
}

OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT} ({len(paths)} paths, {len(seen_ops)} operations)")
