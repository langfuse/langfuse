-- Add AWS Bedrock model names for Anthropic models

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-haiku-20240307|anthropic\.claude-3-haiku-20240307-v1:0|claude-3-haiku@20240307)$' WHERE "id" = 'cltr0w45b000008k1407o9qv1';

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-sonnet-20240229|anthropic\.claude-3-sonnet-20240229-v1:0|claude-3-sonnet@20240229)$' WHERE "id" = 'cltgy0pp6000108le56se7bl3';

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-opus-20240229|anthropic\.claude-3-opus-20240229-v1:0|claude-3-opus@20240229)$' WHERE "id" = 'cltgy0iuw000008le3vod1hhy';

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-5-sonnet-20240620|anthropic\.claude-3-5-sonnet-20240620-v1:0|claude-3-5-sonnet@20240620)$' WHERE "id" = 'clxt0n0m60000pumz1j5b7zsf';
