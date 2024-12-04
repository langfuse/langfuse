WITH observations_agg AS (
    SELECT
        t.user_id,
        count(*) as obs_count,
        sumMap(usage_details) as sum_usage_details,
        sum(total_cost) as sum_total_cost
    FROM
        observations o
            join traces t on t.id = o.trace_id
            and t.project_id = o.project_id
    WHERE
        o.project_id = {projectId: String }
      AND o.trace_id in (
        SELECT
        id
        from
        traces
        where
        user_id IN ({userIds: Array(String) })
        )
      AND t.user_id IS NOT NULL
      AND t.user_id != ''
      AND t.user_id IN ({userIds: Array(String) })
      AND t.project_id = {projectId: String }
      AND o.type = 'GENERATION'
    GROUP BY
        t.user_id
),
     user_metric_data AS (
         SELECT
             t.user_id,
             max(t.timestamp) as max_timestamp,
             min(t.timestamp) as min_timestamp,
             count(*) as trace_count
         FROM
             traces t
         WHERE
             t.user_id IS NOT NULL
           AND t.user_id != ''
           AND t.user_id IN ({userIds: Array(String) })
           AND t.project_id = {projectId: String }
         GROUP BY
             t.user_id
     )
SELECT
    *
FROM
    user_metric_data umd
        join observations_agg oa on oa.user_id = umd.user_id