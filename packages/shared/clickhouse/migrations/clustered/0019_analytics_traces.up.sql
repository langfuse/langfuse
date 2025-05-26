CREATE VIEW analytics_traces ON CLUSTER default AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countTraces,
    max(user_id IS NOT NULL) AS hasUsers,
    max(session_id IS NOT NULL) AS hasSessions,
    max(if(environment != 'default', 1, 0)) AS hasEnvironments
FROM
    traces
GROUP BY
    project_id,
    hour;
