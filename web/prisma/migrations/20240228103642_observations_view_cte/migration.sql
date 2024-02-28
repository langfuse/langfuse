CREATE OR REPLACE VIEW "observations_view" AS
WITH model_ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY project_id, model_name, unit
            ORDER BY project_id ASC, start_date DESC NULLS LAST
        ) AS rn
        -- adds a new column to the models table ordering the rows by project_id, model_name, and unit
        -- each query should take the first row within a partition
    FROM
        models
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
LEFT JOIN model_ranked m ON
    m.rn = 1 AND
    (m.project_id = o.project_id OR m.project_id IS NULL) AND
    m.model_name = o.internal_model AND
    (m.start_date < o.start_time OR m.start_date IS NULL) AND
    o.unit::TEXT = m.unit;
