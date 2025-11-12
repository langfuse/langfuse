from clickhouse_connect.driver import create_client, create_async_client

driver_name = 'clickhousedb'

get_client = create_client
get_async_client = create_async_client
