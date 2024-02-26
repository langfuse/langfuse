CREATE OR REPLACE VIEW "observations_view" AS
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
LEFT JOIN LATERAL (
    SELECT
        m1.*
    FROM
        models m1
    WHERE (m1.project_id = o.project_id OR m1.project_id IS NULL)
    AND m1.model_name = o.internal_model
    AND (m1.start_date < o.start_time OR m1.start_date IS NULL)
    AND o.unit::TEXT = m1.unit
    ORDER BY
        m1.project_id ASC, -- in postgres, NULLs are sorted last when ordering ASC
        m1.start_date DESC NULLS LAST -- now, NULLs are sorted last when ordering DESC as well
    LIMIT 1
) m ON TRUE
