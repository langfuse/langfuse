ALTER TABLE traces ON CLUSTER default RESET SETTING enable_block_number_column, enable_block_offset_column;
ALTER TABLE observations ON CLUSTER default RESET SETTING enable_block_number_column, enable_block_offset_column;
ALTER TABLE scores ON CLUSTER default RESET SETTING enable_block_number_column, enable_block_offset_column;
ALTER TABLE dataset_run_items_rmt ON CLUSTER default RESET SETTING enable_block_number_column, enable_block_offset_column;
