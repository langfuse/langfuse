import { type ObservationView } from "@prisma/client";
import { usdFormatter } from "@/src/utils/numbers";

/**
 * WARNING: Mutates the allGenerations array in place.
 * Converts an array of ObservationView objects to a CSV string.
 * The array is mutated in place to avoid memory issues with large datasets.
 *
 * @param allGenerations - An array of ObservationView objects.
 * @returns The CSV string representation of the observations.
 * @sideEffects Mutates the allGenerations array in place to an `undefined[]`.
 * @throws Error if the input is invalid.
 */
export function mutateGenerationsInPlaceToCSV(
  allGenerations: (ObservationView | undefined)[] | string,
): string {
  if (typeof allGenerations === "string") {
    throw Error("Invalid input");
  }

  const csvHeader = [
    "traceId",
    "name",
    "model",
    "startTime",
    "endTime",
    "cost",
    "prompt",
    "completion",
    "metadata",
  ];

  let output = csvHeader.join(",");

  allGenerations.forEach((generation, index, allGenerations) => {
    if (!generation) {
      return;
    }

    const csvRow = [
      generation.traceId,
      generation.name ?? "",
      generation.model ?? "",
      generation.startTime.toISOString(),
      generation.endTime?.toISOString() ?? "",
      generation.calculatedTotalCost
        ? usdFormatter(generation.calculatedTotalCost.toNumber(), 2, 8)
        : "",
      JSON.stringify(generation.input),
      JSON.stringify(generation.output),
      JSON.stringify(generation.metadata),
    ].map((field) => {
      const str = typeof field === "string" ? field : String(field);
      return `"${str.replace(/"/g, '""')}"`;
    });

    output += "\n" + csvRow.join(",");
    allGenerations[index] = undefined;
  });

  return output;
}
