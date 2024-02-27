CREATE OR REPLACE VIEW "observations_view" AS
WITH model_data AS (
    SELECT
        models.*,
        observations.id AS obs_id
    FROM
        models
    JOIN observations ON (models.project_id = observations.project_id OR models.project_id IS NULL)
    AND models.model_name = observations.internal_model
    AND (models.start_date < observations.start_time OR models.start_date IS NULL)
    AND observations.unit::TEXT = models.unit
)
, ranked_models AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY obs_id ORDER BY project_id ASC, start_date DESC NULLS LAST) as rn
    FROM model_data
)
SELECT
    o.*,
    m.id AS "model_id",
    m.start_date AS "model_start_date",
    m.input_price,
    m.output_price,
    m.total_price,
    m.tokenizer_config AS "tokenizer_config",
    CASE 
        WHEN o.input_cost IS NULL AND o.output_cost IS NULL AND o.total_cost IS NULL THEN
            o.prompt_tokens::decimal * m.input_price
        ELSE
            o.input_cost
    END AS "calculated_input_cost",
    CASE 
        WHEN o.input_cost IS NULL AND o.output_cost IS NULL AND o.total_cost IS NULL THEN
            o.completion_tokens::decimal * m.output_price
        ELSE
            o.output_cost
    END AS "calculated_output_cost",
    CASE 
        WHEN o.input_cost IS NULL AND o.output_cost IS NULL AND o.total_cost IS NULL THEN
            CASE 
                WHEN m.total_price IS NOT NULL AND o.total_tokens IS NOT NULL THEN
                    m.total_price * o.total_tokens
                ELSE
                    o.prompt_tokens::decimal * m.input_price + 
                    o.completion_tokens::decimal * m.output_price
            END
        ELSE
            o.total_cost
    END AS "calculated_total_cost",
    CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END AS "latency"
FROM
    observations o
LEFT JOIN ranked_models m ON o.id = m.obs_id AND m.rn = 1
