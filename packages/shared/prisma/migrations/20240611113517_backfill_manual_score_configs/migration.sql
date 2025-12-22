-- Create manual-score config for any project with manual scores and link config_id to scores
BEGIN;
WITH project_configs AS (
INSERT INTO score_configs (id,
		project_id,
		name,
		data_type,
		is_archived,
		min_value,
		max_value,
		description)
SELECT
	encode(sha256((random()::text || clock_timestamp()::text || project_id::text)::bytea), 'hex')::uuid AS id,
	s.project_id,
	'manual-score',
	'NUMERIC',
	FALSE,
	- 1,
	1,
	'Langfuse legacy annotation score.'
FROM ( SELECT DISTINCT
		project_id
	FROM
		scores
	WHERE
		name = 'manual-score'
		AND config_id IS NULL
		AND source = 'ANNOTATION') s
WHERE
	NOT EXISTS (
		SELECT
			1
		FROM
			score_configs sc
		WHERE
			sc.name = 'manual-score'
			AND sc.project_id = s.project_id)
	RETURNING
		id,
		project_id
)
UPDATE
	scores
SET
	config_id = pc.id
FROM
	project_configs pc
WHERE
	scores.project_id = pc.project_id
	AND scores.name = 'manual-score';
COMMIT;