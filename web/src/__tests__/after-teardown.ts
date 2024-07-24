import { teardownRedis } from "@/src/__tests__/test-utils";

afterAll(async () => {
  await teardownRedis();
});
