-- WP-02 audit append-only hash chain.
-- audit.append_event() is the only supported write path for audit.audit_events.
-- It locks the per-chain head, computes a canonical payload, hashes the payload
-- together with prev_hash, inserts the event, and advances the head in the same
-- transaction as the domain change.
-- This file is the canonical SQL copied into
-- prisma/migrations/20261030000400_audit_hash_chain/migration.sql.

CREATE FUNCTION audit.canonical_event(p_event jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_event->'id',
    'chain_key', p_event->'chain_key',
    'seq', p_event->'seq',
    'company_id', p_event->'company_id',
    'occurred_at', p_event->'occurred_at',
    'actor_type', p_event->'actor_type',
    'actor_user_id', p_event->'actor_user_id',
    'actor_label', p_event->'actor_label',
    'action', p_event->'action',
    'module_code', p_event->'module_code',
    'entity_type', p_event->'entity_type',
    'entity_id', p_event->'entity_id',
    'scope_type', p_event->'scope_type',
    'scope_id', p_event->'scope_id',
    'request_id', p_event->'request_id',
    'ip', p_event->'ip',
    'user_agent', p_event->'user_agent',
    'before', p_event->'before',
    'after', p_event->'after',
    'metadata', p_event->'metadata'
  );
$$;

CREATE FUNCTION audit.hash_event(p_prev_hash bytea, p_canonical jsonb)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.digest(
    COALESCE(p_prev_hash, '\x'::bytea) || convert_to(p_canonical::text, 'UTF8'),
    'sha256'
  );
$$;

CREATE FUNCTION audit.append_event(p_chain_key text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, pg_catalog
AS $$
DECLARE
  v_last_seq bigint;
  v_prev bytea;
  v_seq bigint;
  v_event jsonb;
  v_canonical jsonb;
  v_hash bytea;
BEGIN
  IF p_chain_key IS NULL OR btrim(p_chain_key) = '' THEN
    RAISE EXCEPTION 'chain_key must not be empty'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO audit.audit_chain_heads (chain_key, last_seq, last_hash, updated_at)
  VALUES (p_chain_key, 0, '\x'::bytea, now())
  ON CONFLICT (chain_key) DO NOTHING;

  SELECT last_seq, last_hash INTO v_last_seq, v_prev
  FROM audit.audit_chain_heads
  WHERE chain_key = p_chain_key
  FOR UPDATE;

  v_seq := v_last_seq + 1;

  v_event := jsonb_build_object(
    'id', COALESCE(NULLIF(p_payload->>'id', '')::uuid, gen_random_uuid()),
    'chain_key', p_chain_key,
    'seq', v_seq,
    'company_id', NULLIF(p_payload->>'company_id', '')::uuid,
    'occurred_at', COALESCE(NULLIF(p_payload->>'occurred_at', '')::timestamptz, now()),
    'actor_type', p_payload->>'actor_type',
    'actor_user_id', NULLIF(p_payload->>'actor_user_id', '')::uuid,
    'actor_label', p_payload->>'actor_label',
    'action', p_payload->>'action',
    'module_code', p_payload->>'module_code',
    'entity_type', p_payload->>'entity_type',
    'entity_id', NULLIF(p_payload->>'entity_id', '')::uuid,
    'scope_type', p_payload->>'scope_type',
    'scope_id', NULLIF(p_payload->>'scope_id', '')::uuid,
    'request_id', COALESCE(NULLIF(p_payload->>'request_id', '')::uuid, gen_random_uuid()),
    'ip', NULLIF(p_payload->>'ip', '')::inet,
    'user_agent', p_payload->>'user_agent',
    'before', p_payload->'before',
    'after', p_payload->'after',
    'metadata', COALESCE(p_payload->'metadata', '{}'::jsonb)
  );

  v_canonical := audit.canonical_event(v_event);
  v_hash := audit.hash_event(v_prev, v_canonical);

  INSERT INTO audit.audit_events (
    id,
    chain_key,
    seq,
    company_id,
    occurred_at,
    actor_type,
    actor_user_id,
    actor_label,
    action,
    module_code,
    entity_type,
    entity_id,
    scope_type,
    scope_id,
    request_id,
    ip,
    user_agent,
    "before",
    "after",
    metadata,
    prev_hash,
    hash
  )
  VALUES (
    (v_event->>'id')::uuid,
    p_chain_key,
    v_seq,
    NULLIF(v_event->>'company_id', '')::uuid,
    (v_event->>'occurred_at')::timestamptz,
    v_event->>'actor_type',
    NULLIF(v_event->>'actor_user_id', '')::uuid,
    v_event->>'actor_label',
    v_event->>'action',
    v_event->>'module_code',
    v_event->>'entity_type',
    NULLIF(v_event->>'entity_id', '')::uuid,
    v_event->>'scope_type',
    NULLIF(v_event->>'scope_id', '')::uuid,
    (v_event->>'request_id')::uuid,
    NULLIF(v_event->>'ip', '')::inet,
    v_event->>'user_agent',
    NULLIF(v_event->'before', 'null'::jsonb),
    NULLIF(v_event->'after', 'null'::jsonb),
    COALESCE(v_event->'metadata', '{}'::jsonb),
    v_prev,
    v_hash
  );

  UPDATE audit.audit_chain_heads
  SET last_seq = v_seq,
      last_hash = v_hash,
      updated_at = now()
  WHERE chain_key = p_chain_key;
END;
$$;

REVOKE ALL ON FUNCTION audit.append_event(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.append_event(text, jsonb) TO osc_rest_app;
