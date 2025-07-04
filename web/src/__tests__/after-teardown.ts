import teardown from "@/src/__tests__/teardown";
import { ensureTestDatabaseExists } from "@/src/__tests__/test-utils";

beforeAll(async () => {
  await ensureTestDatabaseExists();
});

afterAll(async () => {
  await teardown();
});
