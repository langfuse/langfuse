-- Q33 delete: bounds lookup assignments
-- Built on main by deleteTopicResultsForTraces (worker/src/features/traces/processClickhouseTraceDelete.ts:30); use case: Trace deletion
-- Configuration: 4 proposal

SELECT min(unit_start_time), max(unit_start_time), count() FROM topic_assignments WHERE project_id = {projectId:String} AND trace_id IN ({delIds:Array(String)})
