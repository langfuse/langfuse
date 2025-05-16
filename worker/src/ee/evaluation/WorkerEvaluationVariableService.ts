import { z } from "zod";
import {
  availableDatasetEvalVariables,
  availableTraceEvalVariables,
  variableMapping,
  variableMappingList,
  wipVariableMapping,
  extractValueFromObject,
  type LangfuseEvaluationObject,
} from "@langfuse/shared";
import {
  getObservationForTraceIdByName,
  getTraceById,
} from "@langfuse/shared/src/server";
import { sql } from "kysely";
import { kyselyPrisma } from "@langfuse/shared/src/db";
import { JSONPath } from "jsonpath-plus";

const FetchObjectParams = z.discriminatedUnion("object", [
  z.object({
    object: z.literal("trace"),
    id: z.string(),
    projectId: z.string(),
  }),
  z.object({
    object: z.literal("dataset_item"),
    id: z.string(),
    safeInternalColumn: z.object({
      id: z.string(),
      internal: z.string(),
    }),
    projectId: z.string(),
  }),
  z.object({
    object: z.enum(["generation", "span", "event"]),
    id: z.string(),
    objectName: z.string(),
    projectId: z.string(),
  }),
]);

type FetchObjectParams = z.infer<typeof FetchObjectParams>;

export class WorkerEvaluationVariableService {
  /**
   * Extract value from a database row based on a variable mapping
   * Handles JSON selectors for nested data extraction
   */
  public static parseDatabaseRowToString(
    dbRow: Record<string, unknown>,
    mapping: z.infer<typeof variableMapping>,
  ): string {
    const parseJson = (selectedColumn: unknown, jsonSelector: string) => {
      return JSONPath({
        path: jsonSelector,
        json:
          typeof selectedColumn === "string"
            ? JSON.parse(selectedColumn)
            : selectedColumn,
      });
    };
    return extractValueFromObject(dbRow, mapping, parseJson);
  }

  public static findInternalColumn(
    availableVariableColumns:
      | typeof availableTraceEvalVariables
      | typeof availableDatasetEvalVariables,
    mapping: z.infer<typeof variableMapping>,
    object: LangfuseEvaluationObject,
  ) {
    return availableVariableColumns
      .find((o) => o.id === object)
      ?.availableColumns.find((col) => col.id === mapping.selectedColumnId);
  }

  public static async fetchDatasetItem(
    datasetItemId: string,
    projectId: string,
    safeInternalColumn: {
      id: string;
      internal: string;
    },
  ) {
    return await kyselyPrisma.$kysely
      .selectFrom("dataset_items as d")
      .select(
        sql`${sql.raw(safeInternalColumn.internal)}`.as(safeInternalColumn.id),
      ) // query the internal column name raw
      .where("id", "=", datasetItemId)
      .where("project_id", "=", projectId)
      .executeTakeFirst();
  }

  /**
   * Validate a variable mapping from user input
   * Used to ensure variable mappings are properly formatted
   */
  public static validateVariableMapping(
    mapping: unknown,
  ): z.infer<typeof variableMappingList> {
    return variableMappingList.parse(mapping);
  }

  public static async fetchObject(params: FetchObjectParams) {
    const { object, projectId } = params;

    switch (object) {
      case "trace":
        return await getTraceById({
          traceId: params.id,
          projectId,
        });

      case "dataset_item":
        return await this.fetchDatasetItem(
          params.id,
          projectId,
          params.safeInternalColumn,
        );

      case "generation":
      case "span":
      case "event":
        return (
          await getObservationForTraceIdByName(
            params.id,
            projectId,
            params.objectName,
            undefined,
            true,
          )
        ).shift(); // We only take the first match and ignore duplicate generation-names in a trace.

      default:
        throw new Error(`Unknown object type: ${object}`);
    }
  }

  /**
   * Validate a work-in-progress variable mapping (during form editing)
   */
  public static validateWipVariableMapping(
    mapping: unknown,
  ): z.infer<typeof wipVariableMapping> {
    return wipVariableMapping.parse(mapping);
  }

  /**
   * Process variables after they've been extracted
   * This can be used for any post-processing needs
   */
  public static processExtractedVariables(
    variables: Array<{ var: string; value: string; environment?: string }>,
  ): Record<string, string> {
    return Object.fromEntries(
      variables.map(({ var: key, value }) => [key, value]),
    );
  }
}
