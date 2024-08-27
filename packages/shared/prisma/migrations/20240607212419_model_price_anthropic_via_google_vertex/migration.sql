-- Google Vertex uses @ to separate model name and version

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-haiku(-|@)?20240307)$' WHERE "id" = 'cltr0w45b000008k1407o9qv1';

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-opus(-|@)?20240229)$' WHERE "id" = 'cltgy0iuw000008le3vod1hhy';

UPDATE "models" SET "match_pattern" = '(?i)^(claude-3-sonnet(-|@)?20240229)$' WHERE "id" = 'cltgy0pp6000108le56se7bl3';