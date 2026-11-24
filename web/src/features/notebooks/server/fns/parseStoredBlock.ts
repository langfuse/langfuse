import { type NotebookBlock, storedNotebookBlockSchema } from "../../schema";
import { validateNotebookChartQueries } from "./validateNotebookChartQueries";

const validatedNotebookBlockSchema = storedNotebookBlockSchema.superRefine(
  validateNotebookChartQueries,
);

export function parseStoredBlock(
  value: unknown,
  mode: "stored" | "validate",
): NotebookBlock {
  const schema =
    mode === "validate"
      ? validatedNotebookBlockSchema
      : storedNotebookBlockSchema;
  return schema.parse(value);
}
