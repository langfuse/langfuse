DROP VIEW IF EXISTS analytics_scores;
CREATE VIEW analytics_scores AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countScores,
    max(source = 'ANNOTATION') AS hasAnnotation,
    max(source = 'API') AS hasApi,
    max(source = 'EVAL') AS hasEval,
    max(observation_id IS NOT NULL) AS hasObservationScore,
    max(session_id IS NOT NULL) AS hasSessionScore,
    max(dataset_run_id IS NOT NULL) AS hasDatasetRunScore,
    max(data_type = 'BOOLEAN') AS hasBoolScore,
    max(data_type = 'NUMERIC') AS hasNumericScore,
    max(data_type = 'CATEGORICAL') AS hasCategoricalScore,
    max(comment IS NOT NULL) AS hasComment,
    sumMap(map(concat(if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name), '@', if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version)), toUInt64(1))) AS ingested_sdks
FROM
    scores
WHERE toStartOfHour(timestamp) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY
    project_id,
    hour;
