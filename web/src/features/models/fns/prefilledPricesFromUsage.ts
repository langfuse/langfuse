/** A placeholder price per ingested usage type, so the create form opens with the right rows. */
export const prefilledPricesFromUsage = (
  usageDetails: Record<string, number> | undefined,
): Record<string, number> | undefined =>
  usageDetails && Object.keys(usageDetails).length > 0
    ? Object.fromEntries(
        Object.keys(usageDetails)
          .filter((key) => key !== "total")
          .map((key) => [key, 0.000001]),
      )
    : undefined;
