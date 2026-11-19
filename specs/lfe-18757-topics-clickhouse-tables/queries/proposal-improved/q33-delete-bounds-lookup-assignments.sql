-- Q33 delete: bounds lookup assignments
-- Built on main by trace delete bounds (processClickhouseTraceDelete.ts:30); use case: Deletion of traces
-- Configuration: 4 proposal + improved

SELECT min(unit_start_time), max(unit_start_time), count() FROM topic_assignments WHERE project_id = {projectId:String} AND trace_id IN ({delIds:Array(String)})
