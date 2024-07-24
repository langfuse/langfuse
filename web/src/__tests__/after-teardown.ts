afterEach(async () => {
  const { redis } = await import("@langfuse/shared/src/server");
  redis?.disconnect();
  console.log("Teardown complete");
});
