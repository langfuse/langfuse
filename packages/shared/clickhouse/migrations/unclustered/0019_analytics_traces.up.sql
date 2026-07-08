CREATE VIEW analytics_traces AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countTraces,
    max(user_id IS NOT NULL) AS hasUsers,
    max(session_id IS NOT NULL) AS hasSessions,
    max(if(environment != 'default', 1, 0)) AS hasEnvironments,
    max(length(tags) > 0) AS hasTags
FROM
    traces
WHERE toStartOfHour(timestamp) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY
    project_id,
    hour;
