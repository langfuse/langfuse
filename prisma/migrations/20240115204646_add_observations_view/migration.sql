
CREATE VIEW "observations_view" AS
SELECT
	o.*,
	m.start_date AS "model_start_date",
	m.input_price,
	m.output_price,
	m.total_price
FROM
	observations o
	LEFT JOIN models m ON m.id = (
		SELECT
			id
		FROM
			models
		WHERE (project_id = o.project_id
			OR project_id IS NULL)
		AND model_name = o.model
		AND(start_date < o.start_time
			OR o.start_time IS NULL)
	ORDER BY
		project_id DESC,
		start_date DESC
	LIMIT 1)