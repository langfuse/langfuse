CREATE VIEW observation_stats_view ON CLUSTER default AS
  SELECT
    os.project_id,
    os.trace_id,
    uniqMerge(os.count) AS count,
    min(os.min_start_time) AS min_start_time,
    max(os.max_start_time) AS max_start_time,
    max(os.max_end_time) AS max_end_time,
    groupUniqArrayArray(os.unique_levels) as unique_levels,
    groupArray(oc.level) as levels,
    sumMap(oc.usage_details) AS usage_details,
    sumMap(oc.cost_details) AS cost_details,
    sum(oc.total_cost) AS total_cost
  FROM observation_stats os FINAL
  LEFT JOIN observation_costs oc FINAL
  ON os.project_id = oc.project_id AND os.trace_id = oc.trace_id
  GROUP BY os.project_id, os.trace_id;
