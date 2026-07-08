-- Drop traces_null and trace amt tables
DROP TABLE IF EXISTS traces_null ON CLUSTER default;
DROP TABLE IF EXISTS traces_all_amt ON CLUSTER default;
DROP TABLE IF EXISTS traces_7d_amt ON CLUSTER default;
DROP TABLE IF EXISTS traces_30d_amt ON CLUSTER default;