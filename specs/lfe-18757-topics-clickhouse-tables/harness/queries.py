# Topics read queries as main builds them (see ../02-queries.md), with table names templated per layout.
ENV = "AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}"
W = "unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}"
def latest(S, scope):
    return f"""(facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
      SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM {S}
      WHERE project_id = {{projectId:String}}
        AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
          SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM {S}
          WHERE project_id = {{projectId:String}} AND {W} {scope}
          GROUP BY facet_id, trace_id, if(trace_id = '', session_id, ''))
      ORDER BY facet_version DESC, processed_at DESC
      LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, ''))"""
def rf(o, runs_param):  # option rewrite: rule known from the run (Postgres)
    return f" AND rule_id IN {{ruleIds:Array(String)}}" if o["rule"] else ""
SUMCOLS = """project_id AS projectId, facet_id AS facetId, facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId, trigger_type AS triggerType,
  environment, trace_name AS traceName, toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs, processing_state AS state, summary, embedding,
  transcript_id AS transcriptId, transcript_version AS transcriptVersion, summary_model AS summaryModel, embedding_model AS embeddingModel,
  provided_usage_details AS providedUsageDetails, usage_details AS usageDetails, provided_cost_details AS providedCostDetails, cost_details AS costDetails,
  toUnixTimestamp64Milli(processed_at) AS processedAtMs, metadata AS metadataJson"""
ASGCOLS = """project_id AS projectId, facet_id AS facetId, facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId, environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs, coordinates, toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
  clustering_run_id AS runId, topic_id AS topicId, topic_version_id AS topicVersionId, distance, runner_up_distance AS runnerUpDistance, origin,
  toUnixTimestamp64Milli(assigned_at) AS assignedAtMs"""

def build(o):
    S, A, E = o["S"], o["A"], o["E"]
    q = {}
    q["Q07 page counts: summaries"] = f"""SELECT facet_id, uniqCombined(trace_id) AS total, uniqCombinedIf(trace_id, processing_state = 'complete') AS complete,
      uniqCombinedIf(trace_id, processing_state = 'complete' AND facet_version = {{versions:Array(UInt32)}}[indexOf({{facetIds:Array(String)}}, facet_id)]) AS usable,
      uniqCombinedIf(trace_id, processing_state = 'not_applicable') AS not_applicable, uniqCombinedIf(trace_id, processing_state = 'insufficient_input') AS insufficient_input
      FROM {S} WHERE project_id = {{projectId:String}} AND {W} AND trace_id != '' AND facet_id IN {{facetIds:Array(String)}} {ENV} GROUP BY facet_id"""
    q["Q08 page counts: assignments"] = f"""SELECT facet_id, topic_id, grouping(topic_id) AS is_facet_total, uniqCombined(trace_id) AS count, uniqCombinedIf(trace_id, topic_id != '') AS assigned
      FROM {A} WHERE project_id = {{projectId:String}} AND {W} AND trace_id != '' AND facet_id IN {{facetIds:Array(String)}} {ENV} AND clustering_run_id != ''
      AND clustering_run_id = {{runIds:Array(String)}}[indexOf({{facetIds:Array(String)}}, facet_id)]{rf(o,'runIds')}
      GROUP BY GROUPING SETS ((facet_id, topic_id), (facet_id))"""
    q["Q09 list candidates (newest)"] = f"""SELECT facet_id, trace_id, unit_start_time FROM {S} WHERE project_id = {{projectId:String}} AND {W}
      AND facet_id IN {{facetIds:Array(String)}} AND trace_id != '' {ENV}
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC, trace_id DESC, facet_id DESC LIMIT 200"""
    q["Q09 topic page candidates"] = f"""SELECT facet_id, trace_id, unit_start_time FROM {A} WHERE project_id = {{projectId:String}} AND {W}
      AND facet_id IN {{facetIds:Array(String)}} AND clustering_run_id IN {{publishedRunIds:Array(String)}}{rf(o,'')} AND topic_id IN {{topicIds:Array(String)}} {ENV}
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC, trace_id DESC, facet_id DESC LIMIT 200"""
    q["Q10 list resolve (200 candidates)"] = f"""WITH summaries AS (
        SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at, processing_state, summary, trace_name, environment FROM {S}
        WHERE project_id = {{projectId:String}} AND unit_start_time >= {{cfrom:DateTime64(3)}} AND unit_start_time < {{cto:DateTime64(3)}} AND trace_id != '' AND facet_id IN {{facetIds:Array(String)}} {ENV}
          AND {latest(S, "AND trace_id != '' AND facet_id IN {facetIds:Array(String)} AND trace_id IN {p0:Array(String)}").replace('{from:DateTime64(3)}','{cfrom:DateTime64(3)}').replace('{to:DateTime64(3)}','{cto:DateTime64(3)}')}
        LIMIT 1 BY facet_id, trace_id),
      assignments AS (
        SELECT trace_id AS a_trace_id, facet_id AS a_facet_id, facet_version AS a_facet_version, unit_start_time AS a_unit_start_time,
          summary_processed_at AS a_summary_processed_at, topic_id AS a_topic_id, topic_version_id AS a_topic_version_id, clustering_run_id AS a_run_id, assigned_at AS a_assigned_at
        FROM {A} WHERE project_id = {{projectId:String}} AND unit_start_time >= {{cfrom:DateTime64(3)}} AND unit_start_time < {{cto:DateTime64(3)}} AND trace_id != '' AND facet_id IN {{facetIds:Array(String)}}
          AND clustering_run_id IN {{publishedRunIds:Array(String)}}{rf(o,'')} AND trace_id IN {{p0:Array(String)}}
        ORDER BY facet_version DESC, assigned_at DESC, origin DESC LIMIT 1 BY a_facet_id, a_run_id, a_trace_id),
      current AS (
        SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at, processing_state, summary, trace_name, environment,
          processing_state = 'complete' AND a_trace_id != '' AND a_facet_version = facet_version AND a_unit_start_time = unit_start_time AND a_summary_processed_at = processed_at AS matched,
          if(matched, a_topic_id, '') AS topic_id, if(matched, a_topic_version_id, '') AS topic_version_id, if(matched, a_run_id, '') AS clustering_run_id, a_assigned_at AS assigned_at,
          multiIf(processing_state != 'complete', toString(processing_state), NOT matched, 'awaiting_map', topic_id != '', 'assigned', 'outlier') AS topic_status
        FROM summaries LEFT JOIN assignments ON a_trace_id = trace_id AND a_facet_id = facet_id),
      ranked AS (
        SELECT *, groupArrayIf(topic_id, topic_status = 'assigned') OVER (PARTITION BY facet_id, trace_id) AS key_topic_ids,
          row_number() OVER (PARTITION BY facet_id, trace_id ORDER BY matched DESC, topic_status = 'assigned' DESC, assigned_at DESC) AS key_rank
        FROM current WHERE has(arrayZip({{p1:Array(String)}}, {{p2:Array(String)}}, {{p3:Array(DateTime64(3))}}), (facet_id, trace_id, unit_start_time)))
      SELECT trace_id, facet_id, facet_version, unit_start_time, trace_name, environment, toString(processing_state) AS state, summary AS summary_text, processed_at,
        topic_status, topic_id, topic_version_id, clustering_run_id FROM ranked WHERE key_rank = 1 ORDER BY unit_start_time DESC, trace_id DESC, facet_id DESC"""
    q["Q11 scatter summaries (1000 ids)"] = f"""SELECT project_id, facet_id, facet_version, trace_id, session_id, processing_state, summary, environment, unit_start_time, processed_at FROM {S}
      WHERE project_id = {{projectId:String}} AND {W} AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}} AND trace_id IN {{traceIds:Array(String)}}
        AND {latest(S, "AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32} AND trace_id IN {traceIds:Array(String)}")}
      ORDER BY processed_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')"""
    q["Q12 trace header: unit time (93d)"] = f"""SELECT count() AS found, min(unit_start_time), max(unit_start_time) FROM {S}
      WHERE project_id = {{projectId:String}} AND unit_start_time >= {{wfrom:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}} AND trace_id IN {{oneTrace:Array(String)}}"""
    q["Q11 trace header summary (1 trace)"] = f"""SELECT project_id, facet_id, facet_version, trace_id, session_id, processing_state, summary, environment FROM {S}
      WHERE project_id = {{projectId:String}} AND unit_start_time >= {{tfrom:DateTime64(3)}} AND unit_start_time < {{tto:DateTime64(3)}} AND facet_id = {{facetId:String}} AND trace_id IN {{oneTrace:Array(String)}}
      ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY project_id, trace_id, if(trace_id = '', session_id, '')"""
    q["Q18 trace header assignments"] = f"""SELECT {ASGCOLS} FROM {A} WHERE project_id = {{projectId:String}} AND unit_start_time >= {{tfrom:DateTime64(3)}} AND unit_start_time < {{tto:DateTime64(3)}} AND facet_id = {{facetId:String}}
        AND clustering_run_id IN {{facetRuns:Array(String)}}{rf(o,'')} AND trace_id IN {{oneTrace:Array(String)}}
      ORDER BY facet_version DESC, assigned_at DESC, origin DESC LIMIT 1 BY project_id, facet_id, clustering_run_id, trace_id, if(trace_id = '', session_id, '')"""
    q["Q19 tracing table topics (100 traces)"] = f"""SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id FROM (SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id
      FROM {A} WHERE project_id = {{projectId:String}} AND unit_start_time >= {{pfrom:DateTime64(3)}} AND unit_start_time < {{pto:DateTime64(3)}} AND facet_id IN {{allFacets:Array(String)}} AND trace_id IN {{pageTraces:Array(String)}}
        AND clustering_run_id IN {{allRuns:Array(String)}}{rf(o,'').replace('ruleIds', 'allRules')} ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, clustering_run_id, trace_id)"""
    q["Q20 tracing topic filter (7d)"] = f"""SELECT count() FROM (SELECT trace_id FROM (SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id FROM {A}
      WHERE project_id = {{projectId:String}} AND unit_start_time >= {{f7:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}} AND facet_id = {{facetId:String}} AND trace_id != '' AND trace_id IN (
        SELECT trace_id FROM {A} WHERE project_id = {{projectId:String}} AND unit_start_time >= {{f7:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}}
          AND facet_id = {{facetId:String}} AND clustering_run_id IN {{facetRuns:Array(String)}}{rf(o,'')} AND topic_id IN {{topicIds:Array(String)}})
        AND clustering_run_id IN {{facetRuns:Array(String)}}{rf(o,'')}
      ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, clustering_run_id, trace_id) WHERE topic_id IN {{topicIds:Array(String)}})"""
    q["Q21 scatter assignments"] = f"""SELECT {ASGCOLS} FROM {A} WHERE project_id = {{projectId:String}} AND {W} AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}}
        AND clustering_run_id = {{runId:String}}{rf(o,'') .replace('ruleIds','ruleOne')} AND origin = 'initial' AND trace_id != ''
      ORDER BY assigned_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')"""
    q["Q22 refit: previous run ids"] = f"""SELECT DISTINCT trace_id AS traceId FROM {A} WHERE project_id = {{projectId:String}} AND {W} AND clustering_run_id = {{prevRun:String}}{rf(o,'').replace('ruleIds','ruleOne')}
        AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}} AND origin = 'initial' AND trace_id != '' ORDER BY traceId LIMIT 20001"""
    q["Q23 fit readback (1000 ids)"] = f"""SELECT {ASGCOLS} FROM {A} WHERE project_id = {{projectId:String}} AND {W} AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}}
        AND clustering_run_id = {{runId:String}}{rf(o,'').replace('ruleIds','ruleOne')} AND (trace_id, if(trace_id = '', session_id, '')) IN arrayZip({{traceIds:Array(String)}}, {{emptyIds:Array(String)}})
      ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')"""
    q["Q33 delete: bounds lookup (10 ids, no time)"] = f"""SELECT min(unit_start_time), max(unit_start_time), count() FROM {S} WHERE project_id = {{projectId:String}} AND trace_id IN ({{delIds:Array(String)}})"""
    q["Q33 delete: bounds lookup assignments"] = f"""SELECT min(unit_start_time), max(unit_start_time), count() FROM {A} WHERE project_id = {{projectId:String}} AND trace_id IN ({{delIds:Array(String)}})"""
    # nightly
    dims_ok = "AND length(embedding) = {embeddingDimensions:UInt32}"
    if True:
        q["Q13 nightly: new summaries? (1d)"] = f"""SELECT facet_id, facet_version, count() FROM (SELECT facet_id, facet_version, trace_id FROM (
            SELECT facet_id, facet_version, trace_id, processing_state, embedding_model, length(embedding) AS dimensions, environment FROM {E}
            WHERE project_id = {{projectId:String}} AND unit_start_time >= {{d1:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}} AND trace_id != ''
              AND (facet_id, facet_version) IN arrayZip({{facetIds:Array(String)}}, {{versions:Array(UInt32)}})
              AND {latest(E, "AND trace_id != '' AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {versions:Array(UInt32)})").replace('{from:DateTime64(3)}','{d1:DateTime64(3)}')}
            ORDER BY processed_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
          ) WHERE processing_state = 'complete' AND embedding_model = {{embeddingModel:String}} AND dimensions = {{embeddingDimensions:UInt32}} {ENV}) GROUP BY facet_id, facet_version"""
        q["Q15 refit today: newest 16k, 7d step"] = f"""SELECT {SUMCOLS} FROM {E} WHERE project_id = {{projectId:String}} AND unit_start_time >= {{f7:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}}
            AND trace_id != '' AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}}
            AND (trace_id, unit_start_time, processed_at) IN (SELECT trace_id, unit_start_time, processed_at FROM (SELECT * FROM (
              SELECT trace_id, unit_start_time, processed_at, processing_state, embedding_model, environment, length(embedding) AS dimensions FROM {E}
              WHERE project_id = {{projectId:String}} AND unit_start_time >= {{f7:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}} AND trace_id != '' AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}}
                AND {latest(E, "AND trace_id != '' AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}").replace('{from:DateTime64(3)}','{f7:DateTime64(3)}')}
              ORDER BY processed_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
            ) WHERE processing_state = 'complete' AND embedding_model = {{embeddingModel:String}} AND dimensions = {{embeddingDimensions:UInt32}} {ENV})
            ORDER BY unit_start_time DESC, trace_id LIMIT 16000)
          ORDER BY unit_start_time DESC, trace_id LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')"""
    else:
        q["Q13 nightly: new summaries? (1d)"] = f"""SELECT facet_id, facet_version, count() FROM (SELECT facet_id, facet_version, trace_id FROM {E}
            WHERE project_id = {{projectId:String}} AND unit_start_time >= {{d1:DateTime64(3)}} AND unit_start_time < {{to:DateTime64(3)}}
              AND (facet_id, facet_version) IN arrayZip({{facetIds:Array(String)}}, {{versions:Array(UInt32)}}) AND embedding_model = {{embeddingModel:String}} {dims_ok}
            ORDER BY processed_at DESC LIMIT 1 BY facet_id, facet_version, trace_id, session_id) GROUP BY facet_id, facet_version"""
    # proposed stable-sample refit, 100k random units over 30 or 7 days
    for label, frm, kp in (("30d", "{from:DateTime64(3)}", "k30"), ("7d", "{f7:DateTime64(3)}", "k7")):
        h = "cityHash64(if(trace_id = '', session_id, trace_id))" if o["name"] == "main" else "unit_hash"
        q[f"Q15' refit stable 100k / {label}"] = f"""SELECT {SUMCOLS} FROM {E} WHERE project_id = {{projectId:String}} AND unit_start_time >= {frm} AND unit_start_time < {{to:DateTime64(3)}}
            AND facet_id = {{facetId:String}} AND facet_version = {{facetVersion:UInt32}} AND processing_state = 'complete' AND embedding_model = {{embeddingModel:String}} {dims_ok} {ENV}
            AND {h} < {{{kp}:UInt64}}
          ORDER BY processed_at DESC LIMIT 1 BY trace_id, if(trace_id = '', session_id, '')"""
    return q
