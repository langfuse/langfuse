import path from "node:path";
import teardown from "@/src/__tests__/teardown";
import { ensureTestDatabaseExists } from "@/src/__tests__/test-utils";

function shouldSkipDatabaseBootstrap() {
  const testPath = expect.getState().testPath;

  if (!testPath) {
    return false;
  }

  return testPath.includes(
    `${path.sep}src${path.sep}__tests__${path.sep}server${path.sep}unit${path.sep}`,
  );
}

beforeAll(async () => {
  if (shouldSkipDatabaseBootstrap()) {
    return;
  }

  await ensureTestDatabaseExists();
});

afterAll(async () => {
  await teardown();
});
