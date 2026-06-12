-- GreptimeDB full-text indexes for the read path (04-read-path.md, P0b).
--
-- 0001 created input/output and the EAV value columns as plain STRING. The read path needs
-- content search (CH `ILIKE` / token search on input/output) and metadata-value term search. On
-- GreptimeDB the indexed path is `matches_term(col, ?)` / `` `col` @@ ? `` (whole-term matching),
-- which requires a FULLTEXT INDEX on the column; without it the query degrades to a `lower() LIKE`
-- full scan. This migration declares those indexes.
--
-- Semantics to keep in mind when building the filter/search dialect:
--   - `matches_term` / `@@` is WHOLE-TERM (tokenized), not arbitrary substring. CH `contains`
--     (substring) maps to `matches_term` only for word boundaries; true substring/prefix/suffix
--     stays on `LIKE` (flagged scan-prone) until a better index exists.
--   - backend='bloom' gives a compact probabilistic index (false positives filtered by the exact
--     predicate); analyzer='English' lower-cases + tokenizes; case_sensitive='false'.
--
-- Verify index usage (not just "returns rows") with EXPLAIN once data is seeded:
--   EXPLAIN ANALYZE SELECT id FROM traces WHERE matches_term(input, 'foo') AND project_id = '...';
--
-- Apply: mysql -h127.0.0.1 -P4002 -uroot openfuse < 0004_fts_indexes.sql

ALTER TABLE traces MODIFY COLUMN `input`  SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');
ALTER TABLE traces MODIFY COLUMN `output` SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');

ALTER TABLE observations MODIFY COLUMN `input`  SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');
ALTER TABLE observations MODIFY COLUMN `output` SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');

-- EAV value columns: enable metadata-value term search (the `=` operator still uses the existing
-- skipping index; FULLTEXT serves the `contains`/token cases).
ALTER TABLE traces_metadata       MODIFY COLUMN `value` SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');
ALTER TABLE observations_metadata MODIFY COLUMN `value` SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');
ALTER TABLE scores_metadata       MODIFY COLUMN `value` SET FULLTEXT INDEX WITH (analyzer='English', case_sensitive='false', backend='bloom');
