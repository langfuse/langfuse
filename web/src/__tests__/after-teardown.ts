import teardown from "@/src/__tests__/teardown";

afterAll(async () => {
  // In the shared-context "server" project (isolate: false) workers are
  // reused across test files, so disconnecting the shared redis/ClickHouse
  // singletons here would break later files in the same worker. The forked
  // workers are terminated at the end of the run, which closes the
  // connections instead.
  if (process.env.VITEST_SHARED_CONTEXT === "1") {
    return;
  }

  await teardown();
  // The teardown dynamically imports the heavy @langfuse/shared server module
  // graph; under a fully loaded CI runner that alone can exceed the default
  // 10s hook timeout.
}, 30_000);
