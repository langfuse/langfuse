-- Drop materialized views derived from traces_null table
DROP MATERIALIZED VIEW IF EXISTS traces_all_amt_mv;
DROP MATERIALIZED VIEW IF EXISTS traces_7d_amt_mv;
DROP MATERIALIZED VIEW IF EXISTS traces_30d_amt_mv;