export const handleBatch = async (
  events: z.infer<typeof ingestionApiSchema>["batch"],
  metadata: z.infer<typeof ingestionApiSchema>["metadata"],
  req: NextApiRequest,
  authCheck: AuthHeaderVerificationResult
) => {
  console.log(
    `handling ingestion ${events.length} events ${isSigtermReceived() ? "after SIGTERM" : ""}`
  );

  if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);

  const results: BatchResult[] = []; // Array to store the results

  const errors: {
    error: unknown;
    id: string;
    type: string;
  }[] = []; // Array to store the errors

  for (const singleEvent of events) {
    try {
      const result = await retry(async () => {
        return await handleSingleEvent(
          singleEvent,
          metadata,
          req,
          authCheck.scope
        );
      });
      results.push({
        result: result,
        id: singleEvent.id,
        type: singleEvent.type,
      }); // Push each result into the array
    } catch (error) {
      // Handle or log the error if `handleSingleEvent` fails
      console.error("Error handling event:", error);
      // Decide how to handle the error: rethrow, continue, or push an error object to results
      // For example, push an error object:
      errors.push({
        error: error,
        id: singleEvent.id,
        type: singleEvent.type,
      });
    }
  }

  if (env.CLICKHOUSE_URL) {
    await new WorkerClient()
      .sendIngestionBatch({
        batch: events,
        metadata,
        projectId: authCheck.scope.projectId,
      })
      .catch(); // Ignore errors while testing the ingestion via worker
  }

  return { results, errors };
};
