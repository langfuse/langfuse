import { z } from "zod";
import { type ObservationView } from "@prisma/client";
import { jsonSchema } from "@/src/utils/zod";

/**
 * WARNING: Mutates the allGenerations array in place.
 * Converts an array of ObservationView objects to a JSONL string.
 * The array is mutated in place to avoid memory issues with large datasets.
 *
 * @param allGenerations - An array of ObservationView objects.
 * @returns The JSONL string representation of the observations.
 * @sideEffects Mutates the allGenerations array in place to an `undefined[]`.
 * @throws Error if the input is invalid.
 */
export function mutateGenerationsInPlaceToJSONL(
  allGenerations: (ObservationView | undefined)[] | string,
): string {
  if (typeof allGenerations === "string") {
    throw Error("Invalid input");
  }

  const inputSchemaOpenAI = z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  );

  const outputSchema = z
    .object({
      completion: jsonSchema,
    })
    .or(jsonSchema);

  let output: string = "";

  allGenerations.forEach((generation, index, allGenerations) => {
    if (!generation) {
      return;
    }

    const parsedInput = inputSchemaOpenAI.safeParse(generation.input);
    const parsedOutput = outputSchema.safeParse(generation.output);

    if (parsedInput.success && parsedOutput.success) {
      output +=
        JSON.stringify([
          ...parsedInput.data,
          {
            role: "assistant",
            content:
              typeof parsedOutput.data === "object" &&
              "completion" in parsedOutput.data
                ? JSON.stringify(parsedOutput.data.completion)
                : JSON.stringify(parsedOutput.data),
          },
        ]) + "\n";
    }

    allGenerations[index] = undefined;
  });

  return output;
}
