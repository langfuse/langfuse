-- Q33 delete: bounds lookup (10 ids, no time)
-- Built on main by deleteTopicResultsForTraces (worker/src/features/traces/processClickhouseTraceDelete.ts:30); use case: Trace deletion
-- Configuration: 3 meeting + improved

SELECT min(unit_start_time), max(unit_start_time), count() FROM topic_facet_summary_pointers WHERE project_id = {projectId:String} AND trace_id IN ({delIds:Array(String)})
