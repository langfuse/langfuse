import { Transform, type TransformCallback } from "stream";
import { z } from "zod";

import { jsonSchema } from "@/src/utils/zod";
import { type ObservationViewWithScores } from "@/src/server/api/routers/generations/getAllQuery";

export function transformStreamToJsonLines(): Transform {
  return new Transform({
    objectMode: true,
    transform(
      row: ObservationViewWithScores,
      encoding: BufferEncoding,
      callback: TransformCallback,
    ): void {
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

      const parsedInput = inputSchemaOpenAI.safeParse(row.input);
      const parsedOutput = outputSchema.safeParse(row.output);

      if (parsedInput.success && parsedOutput.success) {
        const output = JSON.stringify({
          messages: [
            ...parsedInput.data,
            {
              role: "assistant",
              content:
                typeof parsedOutput.data === "object" &&
                "completion" in parsedOutput.data
                  ? JSON.stringify(parsedOutput.data.completion)
                  : JSON.stringify(parsedOutput.data),
            },
          ],
        });
        this.push(output + "\n");
      }

      callback();
    },
  });
}
