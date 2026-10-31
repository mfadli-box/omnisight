-- Shared assertions for WP-02 database tests.
CREATE SCHEMA IF NOT EXISTS osc_test;

CREATE OR REPLACE FUNCTION osc_test.assert_eq(actual text, expected text, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION osc_test.assert_true(condition boolean, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL %: condition is not true', label;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION osc_test.assert_fails(statement text, expected_state text, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state THEN
      RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, got % (%)',
        label, expected_state, SQLSTATE, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: statement succeeded but should fail', label;
END;
$$;

GRANT USAGE ON SCHEMA osc_test TO osc_rest_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA osc_test TO osc_rest_app;
