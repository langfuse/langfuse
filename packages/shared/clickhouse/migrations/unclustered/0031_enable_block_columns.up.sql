ALTER TABLE traces MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE observations MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE scores MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
ALTER TABLE dataset_run_items_rmt MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1;
