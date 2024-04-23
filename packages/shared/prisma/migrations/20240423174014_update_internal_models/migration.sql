

-- update the internal model name from gpt-4-turbo to gpt-4-1106-preview
UPDATE public.observations
SET internal_model = 'gpt-4-1106-preview'
WHERE
	model = 'gpt-4-1106-preview'
  AND internal_model = 'gpt-4-turbo';