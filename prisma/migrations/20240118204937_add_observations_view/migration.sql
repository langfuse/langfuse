CREATE VIEW "observations_view" AS
SELECT
	o.*,
	m.id AS "model_id",
	m.start_date AS "model_start_date",
	m.input_price,
	m.output_price,
	m.total_price,
	m.tokenizer_config AS "tokenizer_config",
	(o.prompt_tokens ::decimal / 1000) * m.input_price AS "calculated_input_cost",
	(o.completion_tokens ::decimal / 1000) * m.output_price AS "calculated_output_cost",
	CASE WHEN m.total_price IS NOT NULL
		AND o.total_tokens IS NOT NULL THEN
		m.total_price * o.total_tokens
	ELSE
		(o.prompt_tokens ::decimal / 1000) * m.input_price + 
		(o.completion_tokens ::decimal / 1000) * m.output_price
	END AS "calculated_total_cost"
FROM
	observations o
	LEFT JOIN models m ON m.id = (
		SELECT
			id
		FROM
			models
		WHERE (project_id = o.project_id
			OR project_id IS NULL)
		AND model_name = o.internal_model
		AND(start_date < o.start_time
			OR o.start_time IS NULL)
	ORDER BY
		project_id ASC, -- in postgres, NULLs are sorted first
		start_date DESC
	LIMIT 1)