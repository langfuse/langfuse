CREATE VIEW analytics_traces_amt AS
SELECT
    project_id,
    toStartOfHour(argMaxMerge(timestamp)) AS hour,
    uniq(id) AS countTraces,
    max(argMaxMerge(user_id) IS NOT NULL) AS hasUsers,
    max(argMaxMerge(session_id) IS NOT NULL) AS hasSessions,
    max(if(argMaxMerge(environment) != 'default', 1, 0)) AS hasEnvironments,
    max(length(groupUniqArrayArrayMerge(tags)) > 0) AS hasTags,
    -- Enhanced analytics from AMT data
    max(length(maxMapMerge(metadata)) > 0) AS hasMetadata,
    max(argMaxMerge(version) IS NOT NULL) AS hasVersions,
    max(argMaxMerge(release) IS NOT NULL) AS hasReleases,
    max(argMaxMerge(bookmarked) IS NOT NULL AND argMaxMerge(bookmarked) = true) AS hasBookmarked,
    max(argMaxMerge(public) IS NOT NULL AND argMaxMerge(public) = true) AS hasPublic,
    max(length(groupUniqArrayArrayMerge(observation_ids)) > 0) AS hasObservations,
    max(length(groupUniqArrayArrayMerge(score_ids)) > 0) AS hasScores,
    -- Cost and usage aggregations
    sumMapMerge(cost_details) AS totalCostDetails,
    sumMapMerge(usage_details) AS totalUsageDetails
FROM
    traces_all_amt
WHERE toStartOfHour(argMaxMerge(timestamp)) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY
    project_id,
    hour;