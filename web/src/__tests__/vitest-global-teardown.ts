import teardownFn from "./teardown";

export async function teardown() {
  await teardownFn();
}
