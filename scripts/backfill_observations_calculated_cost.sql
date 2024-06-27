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

-- Step 2: Create the batch update function
CREATE OR REPLACE FUNCTION update_calculated_costs(batch_size INT) RETURNS VOID AS $$
DECLARE
    last_id TEXT := '';
    rows_processed INT := 0;
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
            WHERE o.id > last_id
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

        -- Get the number of rows processed in this batch
        GET DIAGNOSTICS rows_processed = ROW_COUNT;

        -- Exit the loop if no more rows were updated
        EXIT WHEN rows_processed = 0;

        -- Small sleep to reduce lock contention (optional)
        PERFORM pg_sleep(0.1);
    END LOOP;
END $$ LANGUAGE plpgsql;

-- Step 3: Execute the function with the desired batch size
SELECT update_calculated_costs(10000);
