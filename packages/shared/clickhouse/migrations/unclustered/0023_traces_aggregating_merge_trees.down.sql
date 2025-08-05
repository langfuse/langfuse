-- Drop materialized views first
DROP VIEW IF EXISTS traces_30d_amt_mv;
DROP VIEW IF EXISTS traces_7d_amt_mv;
DROP VIEW IF EXISTS traces_all_amt_mv;

-- Drop AMT tables
DROP TABLE IF EXISTS traces_30d_amt;
DROP TABLE IF EXISTS traces_7d_amt;
DROP TABLE IF EXISTS traces_all_amt;

-- Drop the Null table
DROP TABLE IF EXISTS traces_null;
