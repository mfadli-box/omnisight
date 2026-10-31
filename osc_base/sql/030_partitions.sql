-- WP-02 monthly partitions for core.login_attempts.
-- Future partitions are created by the maintenance job, not the app role.

-- ---------------------------------------------------------------------------
-- Monthly partitions for core.login_attempts. The maintenance job owns future
-- partition creation; the application role has no DDL rights.
-- ---------------------------------------------------------------------------

CREATE TABLE core.login_attempts_2026_10 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE core.login_attempts_2026_11 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE core.login_attempts_2026_12 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE core.login_attempts_2027_01 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE core.login_attempts_2027_02 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE core.login_attempts_2027_03 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE core.login_attempts_2027_04 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE core.login_attempts_2027_05 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE core.login_attempts_2027_06 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE core.login_attempts_2027_07 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE core.login_attempts_2027_08 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE core.login_attempts_2027_09 PARTITION OF core.login_attempts
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
