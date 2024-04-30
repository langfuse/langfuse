UPDATE
	prompts
SET
	labels = array_append(labels, 'latest')
WHERE
	id = (
		SELECT
			id
		FROM
			prompts AS p2
		WHERE
			p2.name = prompts.name
		ORDER BY
			created_at DESC
		LIMIT 1);