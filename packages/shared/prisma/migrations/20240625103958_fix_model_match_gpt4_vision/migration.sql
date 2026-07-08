/*
Previously, the pattern did not allow for model specifications like "1106" or any other 4-digit block. 
This led to missing models on the generation-update call where the exact model name that was used was provided (including the 4-digit block).
The new pattern allows for:

- "gpt-4-vision-preview" as set on generation-create
- "gpt-4-1106-vision-preview" as set on generation-update

*/

UPDATE
	"models"
SET
	"match_pattern" = '(?i)^(gpt-4(-\d{4})?-vision-preview)$'
WHERE
	"id" = 'clrkvx5gp000108juaogs54ea'
	AND "model_name" = 'gpt-4-turbo-vision';