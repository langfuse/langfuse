-- Step 1: Add the temporary column if it doesn't exist, or set all rows to false if it exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'observations' 
                   AND column_name = 'tmp_has_calculated_cost') THEN
        ALTER TABLE observations ADD COLUMN tmp_has_calculated_cost BOOLEAN DEFAULT FALSE;
    ELSE
        UPDATE observations SET tmp_has_calculated_cost = FALSE;
    END IF;
END $$;

-- STEP: create composite index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "observations_id_type_idx" ON "observations"("id", "type");

-- Step 2: Create the batch update function
CREATE OR REPLACE FUNCTION update_calculated_costs(batch_size INT, max_rows_to_process INT DEFAULT NULL, sleep_between FLOAT DEFAULT 0.1) RETURNS VOID AS $$
DECLARE
    last_id TEXT := '';
    has_processed_rows INT := 0;
    total_rows_processed INT := 0;

BEGIN
    LOOP
        WITH batch AS (
            SELECT o.id,
                o.prompt_tokens,
                o.completion_tokens,
                o.total_tokens,
                o.input_cost,
                o.output_cost,
                o.total_cost,
                m.id AS model_id,
                m.input_price,
                m.output_price,
                m.total_price
            FROM observations o
            LEFT JOIN LATERAL (
                SELECT models.id,
                    models.input_price,
                    models.output_price,
                    models.total_price
                FROM models
                WHERE (models.project_id = o.project_id OR models.project_id IS NULL)
                  AND models.model_name = o.internal_model
                  AND (models.start_date < o.start_time OR models.start_date IS NULL)
                  AND o.unit = models.unit
                ORDER BY models.project_id, models.start_date DESC NULLS LAST
                LIMIT 1
            ) m ON true
            WHERE o.id > last_id AND o.type = 'GENERATION'
            ORDER BY o.id
            LIMIT batch_size
        ),
        updated_batch AS (
            UPDATE observations o
            SET calculated_input_cost = COALESCE(batch.input_cost, batch.prompt_tokens::numeric * batch.input_price),
                calculated_output_cost = COALESCE(batch.output_cost, batch.completion_tokens::numeric * batch.output_price),
                calculated_total_cost = COALESCE(
                    batch.total_cost,
                    CASE
                        WHEN batch.total_price IS NOT NULL AND batch.total_tokens IS NOT NULL THEN batch.total_price * batch.total_tokens::numeric
                        ELSE batch.prompt_tokens::numeric * batch.input_price + batch.completion_tokens::numeric * batch.output_price
                    END
                ),
                internal_model_id = batch.model_id,
                tmp_has_calculated_cost = TRUE
            FROM batch
            WHERE o.id = batch.id
            RETURNING o.id
        )
        -- Get the last id of the updated batch
        SELECT id INTO last_id
        FROM updated_batch
        ORDER BY id DESC
        LIMIT 1;

        -- Get whether any rows have been processed in this batch. (previous row count is 1 if yes, 0 if no)
        GET DIAGNOSTICS has_processed_rows = ROW_COUNT;

        -- Increment the total number of rows processed
        total_rows_processed := total_rows_processed + batch_size;
        RAISE NOTICE '% - Total rows processed after increment: % rows', clock_timestamp(), total_rows_processed;

        -- Exit the loop if the maximum number of rows to process has been reached or no more rows were updated
        EXIT WHEN max_rows_to_process IS NOT NULL AND total_rows_processed >= max_rows_to_process;
        EXIT WHEN has_processed_rows = 0;

        -- Small sleep to reduce lock contention (optional)
        PERFORM pg_sleep(sleep_between);

    END LOOP;
END $$ LANGUAGE plpgsql;

-- Step 3: Execute the function with the desired batch size
SELECT update_calculated_costs(10000, 1000000, 0.1);

-- Step 4: Drop the temporary column and function
ALTER TABLE observations DROP COLUMN tmp_has_calculated_cost;

DROP FUNCTION update_calculated_costs;

-- Step 5: Verify the results. No rows should be returned by the following query
WITH cost_diff AS (
	SELECT
		o.id,
		o.project_id,
		o.trace_id,
		o.start_time,
		o.model AS "model",
		ov.internal_model AS "ov_internal_model",
		o.internal_model AS "o_internal_model",
		o.input,
		o.output,
		o.unit,
		ov.prompt_tokens,
		ov.completion_tokens,
		ov.total_tokens,
		o.input_cost,
		o.output_cost,
		o.total_cost,
		ov.model_id AS "ov_model_id",
		o.internal_model_id AS "o_model_id",
		ov.calculated_input_cost AS "ov_input",
		o.calculated_input_cost AS "o_input",
		ov.calculated_input_cost - o.calculated_input_cost AS input_diff,
		ov.calculated_output_cost AS "ov_output",
		o.calculated_output_cost AS "o_output",
		ov.calculated_output_cost - o.calculated_output_cost AS output_diff,
		ov.calculated_total_cost AS "ov_total",
		o.calculated_total_cost AS "o_total",
		CASE WHEN ABS(ov.calculated_total_cost - o.calculated_total_cost) < 0.00000001
			OR((ov.calculated_total_cost IS NULL
				OR ov.calculated_total_cost = 0)
			AND o.calculated_total_cost IS NULL) THEN
			'OK'
		ELSE
			'NOK'
		END AS total_diff,
		CASE WHEN ov.model_id = o.internal_model_id
			OR(ov.model_id IS NULL
				AND o.internal_model_id IS NULL) THEN
			'OK'
		ELSE
			'NOK'
		END AS model_match
	FROM
		observations_view ov
	LEFT JOIN observations o ON ov.id = o.id
-- 	WHERE
-- 		o.created_at > '2024-06-25T16:50:00'::TIMESTAMP WITH time zone at time zone 'UTC'
ORDER BY
	total_diff ASC
)
SELECT
	*
FROM
	cost_diff c
WHERE
	total_diff = 'NOK'
	OR model_match = 'NOK'
ORDER BY
	total_diff ASC,
	c.start_time DESC;