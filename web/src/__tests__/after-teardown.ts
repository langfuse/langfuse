import teardown from "@/src/__tests__/teardown";

afterAll(async () => {
  await teardown();
});
