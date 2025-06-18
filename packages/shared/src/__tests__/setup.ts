import { beforeAll, afterAll } from 'vitest';
import { clickhouseClient } from '../server/clickhouse/client';

beforeAll(async () => {
  // Setup test database
  await clickhouseClient().exec({
    query: 'CREATE DATABASE IF NOT EXISTS test_langfuse'
  });
});

afterAll(async () => {
  // Cleanup
  await clickhouseClient().exec({
    query: 'DROP DATABASE IF EXISTS test_langfuse'
  });
});
