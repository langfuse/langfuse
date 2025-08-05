-- Drop materialized views first
DROP VIEW IF EXISTS traces_30d_amt_mv ON CLUSTER default;
DROP VIEW IF EXISTS traces_7d_amt_mv ON CLUSTER default;
DROP VIEW IF EXISTS traces_all_amt_mv ON CLUSTER default;

-- Drop AMT tables
DROP TABLE IF EXISTS traces_30d_amt ON CLUSTER default;
DROP TABLE IF EXISTS traces_7d_amt ON CLUSTER default;
DROP TABLE IF EXISTS traces_all_amt ON CLUSTER default;

-- Drop the Null table
DROP TABLE IF EXISTS traces_null ON CLUSTER default;
