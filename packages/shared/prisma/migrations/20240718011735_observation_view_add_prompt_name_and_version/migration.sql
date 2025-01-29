DROP VIEW IF EXISTS "observations_view"; -- Drop view as column was added in 20240705154048_observation_view_add_created_at_updated_at and update view must have same columns
CREATE VIEW "observations_view" AS -- Specify the columns that should be returned in the view, as calculated columns are added but exist in the observations table already
SELECT
    o.id,
    o.name,
    o.start_time,
    o.end_time,
    o.parent_observation_id,
    o.type,
    o.trace_id,
    o.metadata,
    o.model,
    o."modelParameters",
    o.input,
    o.output,
    o.level,
    o.status_message,
    o.completion_start_time,
    o.completion_tokens,
    o.prompt_tokens,
    o.total_tokens,
    o.version,
    o.project_id,
    o.created_at,
    o.updated_at,
    o.unit,
    o.prompt_id,
    p.name as prompt_name,         -- added in this change
    p.version as prompt_version,   -- added in this change
    o.input_cost,
    o.output_cost,
    o.total_cost,
    o.internal_model,
    m.id AS "model_id",
    m.start_date AS "model_start_date",
    m.input_price,
    m.output_price,
    m.total_price,
    m.tokenizer_config AS "tokenizer_config",
    CASE 
        WHEN o.calculated_input_cost IS NULL AND o.input_cost IS NULL AND o.output_cost IS NULL AND o.total_cost IS NULL THEN
            o.prompt_tokens::decimal * m.input_price
        ELSE
            COALESCE(o.calculated_input_cost, o.input_cost)
    END AS "calculated_input_cost",
    CASE 
        WHEN o.calculated_output_cost IS NULL AND o.input_cost IS NULL AND o.output_cost IS NULL AND o.total_cost IS NULL THEN
            o.completion_tokens::decimal * m.output_price
        ELSE
            COALESCE(o.calculated_output_cost, o.output_cost)
    END AS "calculated_output_cost",
    CASE 
        WHEN o.calculated_total_cost IS NULL AND o.input_cost IS NULL AND o.output_cost IS NULL AND o.total_cost IS NULL THEN
            CASE 
                WHEN m.total_price IS NOT NULL AND o.total_tokens IS NOT NULL THEN
                    m.total_price * o.total_tokens
                ELSE
                    o.prompt_tokens::decimal * m.input_price + 
                    o.completion_tokens::decimal * m.output_price
            END
        ELSE
            COALESCE(o.calculated_total_cost, o.total_cost)
    END AS "calculated_total_cost",
    CASE WHEN o.end_time IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time"))::double precision END AS "latency",
    CASE WHEN o.completion_start_time IS NOT NULL AND o.start_time IS NOT NULL THEN EXTRACT(EPOCH FROM (completion_start_time - start_time))::double precision ELSE NULL END as "time_to_first_token"
    
FROM
    observations o
LEFT JOIN LATERAL (
    SELECT
        models.*
    FROM
        models
    WHERE (models.project_id = o.project_id OR models.project_id IS NULL)
    AND models.model_name = o.internal_model
    AND (models.start_date < o.start_time OR models.start_date IS NULL)
    AND o.unit::TEXT = models.unit
    ORDER BY
        models.project_id ASC, -- in postgres, NULLs are sorted last when ordering ASC
        models.start_date DESC NULLS LAST -- now, NULLs are sorted last when ordering DESC as well
    LIMIT 1
) m ON TRUE
LEFT JOIN LATERAL (
    SELECT
        prompts.*
    FROM
        prompts
    WHERE prompts.id = o.prompt_id
    AND prompts.project_id = o.project_id
    LIMIT 1
) p ON TRUE


-- requirements:
-- 1. The view should return all columns from the observations table
-- 2. The view should match with only one model for each observation if:
--     a. The model has the same project_id as the observation, otherwise the model without project_id. 
--     b. The model has the same model_name as the observation
--     c. The model has a start_date that is less than the observation start_time, otherwise the model without start_date
--     d. The model has the same unit as the observation