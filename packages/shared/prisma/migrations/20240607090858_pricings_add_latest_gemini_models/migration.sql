-- does not include pricing yet, will be added as soon as it is calculated at ingestion time

-- remove model if added by faulty migration, context: https://github.com/langfuse/langfuse/issues/2266
DELETE FROM models WHERE id in ('clx30djsn0000w9mzebiv41we', 'clx30hkrx0000w9mz7lqi0ial');

INSERT INTO "models" ("id", "model_name", "match_pattern", "unit") VALUES ('clx30djsn0000w9mzebiv41we', 'gemini-1.5-flash', '(?i)^(gemini-1.5-flash)(@[a-zA-Z0-9]+)?$', 'CHARACTERS');

INSERT INTO "models" ("id", "model_name", "match_pattern", "unit") VALUES ('clx30hkrx0000w9mz7lqi0ial', 'gemini-1.5-pro', '(?i)^(gemini-1.5-pro)(@[a-zA-Z0-9]+)?$', 'CHARACTERS');