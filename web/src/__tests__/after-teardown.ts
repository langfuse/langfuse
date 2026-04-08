import teardown from "@/src/__tests__/teardown";
import {
  ensureDefaultTestProjectExists,
  ensureTestDatabaseExists,
} from "@/src/__tests__/test-utils";

beforeAll(async () => {
  await ensureTestDatabaseExists();
  await ensureDefaultTestProjectExists();
}, 30_000);

afterAll(async () => {
  await teardown();
});
