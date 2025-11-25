CREATE VIEW analytics_observations AS
SELECT
    project_id,
    type,
    toStartOfHour(start_time) AS hour,
    uniq(id) AS countObservations,
    max(level != 'DEFAULT') AS hasLevel,
    max(provided_model_name IS NOT NULL) AS hasProvidedModelName,
    max(length(provided_usage_details) > 0) AS hasProvidedUsageDetails,
    max(length(provided_cost_details) > 0) AS hasProvidedCostDetails,
    max(prompt_name IS NOT NULL) AS hasPromptName
FROM
    observations
WHERE toStartOfHour(start_time) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY
    project_id,
    type,
    hour;
