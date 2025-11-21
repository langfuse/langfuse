ALTER TABLE traces ON CLUSTER default MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE observations ON CLUSTER default MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE scores ON CLUSTER default MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE dataset_run_items_rmt ON CLUSTER default MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
