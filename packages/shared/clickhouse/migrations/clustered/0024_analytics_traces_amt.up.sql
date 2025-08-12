CREATE VIEW analytics_traces_amt ON CLUSTER default AS
SELECT
    project_id,
    toStartOfHour(start_time) AS hour,
    uniq(id) AS countTraces,
    max(user_id IS NOT NULL) AS hasUsers,
    max(session_id IS NOT NULL) AS hasSessions,
    max(if(environment != 'default', 1, 0)) AS hasEnvironments,
    max(length(tags) > 0) AS hasTags
FROM
    traces_all_amt
WHERE toStartOfHour(start_time) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY
    project_id,
    hour;