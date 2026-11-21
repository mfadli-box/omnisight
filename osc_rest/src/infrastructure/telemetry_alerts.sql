WITH readings AS (
    SELECT metric_type, value
    FROM unnest(ARRAY['cpu_pct','ram_used_mb','ram_pct','disk_pct','load_avg','temp_c','smart_failed'], $6::float8[])
         AS m(metric_type, value)
), active AS (
    SELECT r.id, r.metric_type, r.threshold, r.duration_sec, m.value
    FROM public.osc_alert_rule r
    JOIN readings m USING (metric_type)
    WHERE r.company_id=$2 AND (r.area_id IS NULL OR r.area_id=$3) AND m.value >= r.threshold
), reset AS (
    DELETE FROM public.osc_node_alert_state s
    WHERE s.node_id=$1 AND NOT EXISTS (SELECT 1 FROM active a WHERE a.id=s.rule_id)
), breaches AS (
    SELECT a.*, COALESCE(s.breached_since, $5) AS breach_start,
           COALESCE(s.notified, false) AS was_notified
    FROM active a
    LEFT JOIN public.osc_node_alert_state s ON s.node_id=$1 AND s.rule_id=a.id
      AND s.last_sample_at >= $5::timestamptz - interval '15 minutes'
      AND s.metric_type=a.metric_type AND s.threshold=a.threshold AND s.duration_sec=a.duration_sec
), saved AS (
    INSERT INTO public.osc_node_alert_state AS s
        (node_id, rule_id, company_id, area_id, store_id, breached_since, last_sample_at, metric_type, threshold, duration_sec, notified)
    SELECT $1, id, $2, $3, $4, breach_start, $5, metric_type, threshold, duration_sec,
           $5 >= breach_start + make_interval(secs => duration_sec)
    FROM breaches
    ON CONFLICT (node_id, rule_id) DO UPDATE
        SET breached_since=excluded.breached_since, last_sample_at=excluded.last_sample_at,
            metric_type=excluded.metric_type, threshold=excluded.threshold,
            duration_sec=excluded.duration_sec, notified=excluded.notified
    RETURNING rule_id, notified
)
INSERT INTO public.osc_activity_log
    (company_id, area_id, actor_agent_id, action, target_type, target_id, details)
SELECT $2, $3, $1, 'AGENT_TELEMETRY_ALERT', 'osc_alert_rule', b.id::text,
       jsonb_build_object('metric_type', b.metric_type, 'value', b.value, 'threshold', b.threshold,
                          'duration_sec', b.duration_sec, 'breached_since', b.breach_start, 'recorded_at', $5)
FROM breaches b JOIN saved s ON s.rule_id=b.id
WHERE s.notified AND NOT b.was_notified;
