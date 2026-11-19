-- Q12 trace header: unit time (93d)
-- Built on main by getTopicTraceUnitTimeRange (packages/shared/src/server/topics/clickhouse.ts:1316); use case: Trace header, public API trace lookup
-- Configuration: 3 review-call version

SELECT count(), min(unit_start_time), max(unit_start_time) FROM topic_facet_summary_pointers WHERE project_id = {projectId:String} AND unit_start_time >= {wfrom:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id IN {oneTrace:Array(String)}
