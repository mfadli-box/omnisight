-- WP-02 audit hash-chain, append-only grants, and RLS tests.
BEGIN;
SET LOCAL ROLE osc_rest_app;
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000a';

SELECT audit.append_event(
  'company:00000000-0000-4000-8000-00000000000a',
  jsonb_build_object(
    'id', '60000000-0000-4000-8000-0000000000a1'::uuid,
    'company_id', '00000000-0000-4000-8000-00000000000a'::uuid,
    'occurred_at', '2026-10-31T00:00:00Z'::timestamptz,
    'actor_type', 'user',
    'actor_user_id', '30000000-0000-4000-8000-0000000000a1'::uuid,
    'actor_label', 'Admin A',
    'action', 'update',
    'module_code', 'AC',
    'entity_type', 'asset',
    'scope_type', 'company',
    'request_id', '70000000-0000-4000-8000-0000000000a1'::uuid,
    'ip', '192.0.2.1'::inet,
    'user_agent', 'wp02-test',
    'before', '{"status":"active"}'::jsonb,
    'after', '{"status":"inactive"}'::jsonb,
    'metadata', '{"test":true}'::jsonb
  )
);

SELECT audit.append_event(
  'company:00000000-0000-4000-8000-00000000000a',
  jsonb_build_object(
    'id', '60000000-0000-4000-8000-0000000000a2'::uuid,
    'company_id', '00000000-0000-4000-8000-00000000000a'::uuid,
    'occurred_at', '2026-10-31T00:00:01Z'::timestamptz,
    'actor_type', 'user',
    'actor_user_id', '30000000-0000-4000-8000-0000000000a1'::uuid,
    'actor_label', 'Admin A',
    'action', 'create',
    'module_code', 'AC',
    'entity_type', 'asset',
    'scope_type', 'company',
    'request_id', '70000000-0000-4000-8000-0000000000a2'::uuid,
    'ip', '192.0.2.1'::inet,
    'user_agent', 'wp02-test',
    'before', NULL,
    'after', '{"status":"active"}'::jsonb,
    'metadata', '{"test":true}'::jsonb
  )
);

SELECT audit.append_event(
  'company:00000000-0000-4000-8000-00000000000b',
  jsonb_build_object(
    'id', '60000000-0000-4000-8000-0000000000b1'::uuid,
    'company_id', '00000000-0000-4000-8000-00000000000b'::uuid,
    'occurred_at', '2026-10-31T00:00:02Z'::timestamptz,
    'actor_type', 'user',
    'actor_user_id', '30000000-0000-4000-8000-0000000000b1'::uuid,
    'actor_label', 'Admin B',
    'action', 'create',
    'module_code', 'AC',
    'entity_type', 'asset',
    'scope_type', 'company',
    'request_id', '70000000-0000-4000-8000-0000000000b1'::uuid,
    'ip', '192.0.2.2'::inet,
    'user_agent', 'wp02-test',
    'before', NULL,
    'after', '{"status":"active"}'::jsonb,
    'metadata', '{"test":true}'::jsonb
  )
);

SELECT osc_test.assert_eq(
  (SELECT seq::text FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a1'),
  '1',
  'first audit event seq'
);
SELECT osc_test.assert_eq(
  (SELECT seq::text FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a2'),
  '2',
  'second audit event seq'
);
SELECT osc_test.assert_eq(
  (SELECT (prev_hash = '\x'::bytea)::text FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a1'),
  'true',
  'first prev_hash is empty'
);
SELECT osc_test.assert_eq(
  (SELECT (prev_hash = (SELECT hash FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a1'))::text
   FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a2'),
  'true',
  'second prev_hash links to first hash'
);
SELECT osc_test.assert_eq(
  (SELECT length(hash)::text FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a1'),
  '32',
  'audit hash is sha256'
);
SELECT osc_test.assert_eq(
  (SELECT last_seq::text FROM audit.audit_chain_heads
   WHERE chain_key = 'company:00000000-0000-4000-8000-00000000000a'),
  '2',
  'chain head seq'
);
SELECT osc_test.assert_eq(
  (SELECT (last_hash = (SELECT hash FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a2'))::text
   FROM audit.audit_chain_heads WHERE chain_key = 'company:00000000-0000-4000-8000-00000000000a'),
  'true',
  'chain head hash'
);

-- The stored hash equals the documented canonical payload hash.
SELECT osc_test.assert_eq(
  encode(
    audit.hash_event(
      '\x'::bytea,
      audit.canonical_event(jsonb_build_object(
        'id', '60000000-0000-4000-8000-0000000000a1'::uuid,
        'chain_key', 'company:00000000-0000-4000-8000-00000000000a',
        'seq', 1::bigint,
        'company_id', '00000000-0000-4000-8000-00000000000a'::uuid,
        'occurred_at', '2026-10-31T00:00:00Z'::timestamptz,
        'actor_type', 'user',
        'actor_user_id', '30000000-0000-4000-8000-0000000000a1'::uuid,
        'actor_label', 'Admin A',
        'action', 'update',
        'module_code', 'AC',
        'entity_type', 'asset',
        'entity_id', NULL::uuid,
        'scope_type', 'company',
        'scope_id', NULL::uuid,
        'request_id', '70000000-0000-4000-8000-0000000000a1'::uuid,
        'ip', '192.0.2.1'::inet,
        'user_agent', 'wp02-test',
        'before', '{"status":"active"}'::jsonb,
        'after', '{"status":"inactive"}'::jsonb,
        'metadata', '{"test":true}'::jsonb
      ))
    ),
    'hex'
  ),
  (SELECT encode(hash, 'hex') FROM audit.audit_events WHERE id = '60000000-0000-4000-8000-0000000000a1'),
  'audit hash is deterministic'
);

-- RLS: A sees its two events, B sees one, no setting sees none.
SELECT osc_test.assert_eq((SELECT count(*)::text FROM audit.audit_events), '2', 'company A audit events');
SET LOCAL app.company_id = '00000000-0000-4000-8000-00000000000b';
SELECT osc_test.assert_eq((SELECT count(*)::text FROM audit.audit_events), '1', 'company B audit events');
RESET app.company_id;
SELECT osc_test.assert_eq((SELECT count(*)::text FROM audit.audit_events), '0', 'audit events without setting');

-- Append-only grants: the app cannot update or delete events.
SELECT osc_test.assert_fails(
  $sql$UPDATE audit.audit_events SET action = action$sql$,
  '42501',
  'audit_events update is denied'
);
SELECT osc_test.assert_fails(
  $sql$DELETE FROM audit.audit_events$sql$,
  '42501',
  'audit_events delete is denied'
);

SELECT osc_test.assert_fails(
  $sql$INSERT INTO audit.audit_chain_heads (chain_key, last_seq, last_hash, updated_at) VALUES ('evil', 0, '\x'::bytea, now())$sql$,
  '42501',
  'audit_chain_heads insert is denied'
);
SELECT osc_test.assert_fails(
  $sql$UPDATE audit.audit_chain_heads SET last_seq = last_seq$sql$,
  '42501',
  'audit_chain_heads update is denied'
);

-- Invalid append arguments are rejected.
SELECT osc_test.assert_fails(
  $sql$SELECT audit.append_event('', '{}'::jsonb)$sql$,
  '22023',
  'empty chain key is rejected'
);
SELECT osc_test.assert_fails(
  $sql$SELECT audit.append_event('test', '[]'::jsonb)$sql$,
  '22023',
  'non-object payload is rejected'
);

ROLLBACK;
