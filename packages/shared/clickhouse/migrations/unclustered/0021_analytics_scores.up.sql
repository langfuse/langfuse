CREATE VIEW analytics_scores AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countScores,
    max(source = 'ANNOTATION') AS hasAnnotation,
    max(source = 'API') AS hasApi,
    max(source = 'EVAL') AS hasEval
FROM
    scores
GROUP BY
    project_id,
    hour;
