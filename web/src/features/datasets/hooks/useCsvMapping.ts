import { useEffect, useState } from "react";
import { findDefaultColumn } from "../lib/findDefaultColumn";
import {
  FieldMappingType,
  type CsvColumnPreview,
  type CsvMapping,
  type FieldMapping,
  type FreeformField,
  type SchemaField,
} from "@/src/features/datasets/lib/csv/types";
import { isFreeformField } from "@/src/features/datasets/lib/csv/helpers";

type CsvMappingActions = {
  addColumnToInput: (column: CsvColumnPreview, key?: string) => void;
  addColumnToExpectedOutput: (column: CsvColumnPreview, key?: string) => void;
  addColumnToMetadata: (column: CsvColumnPreview) => void;
  removeColumnFromInput: (columnName: string, key?: string) => void;
  removeColumnFromExpectedOutput: (columnName: string, key?: string) => void;
  removeColumnFromMetadata: (columnName: string) => void;
  removeColumnFromAll: (columnName: string) => void;
  isEmpty: () => boolean;
  reset: () => void;
};

function createFreeformField(): FreeformField {
  return { type: FieldMappingType.FREEFORM, columns: [] };
}

function createSchemaField(keys: string[]): SchemaField {
  return {
    type: FieldMappingType.SCHEMA,
    entries: keys.map((key) => ({ key, columns: [] })),
  };
}

export function useCsvMapping({
  preview,
  inputSchemaKeys,
  expectedOutputSchemaKeys,
}: {
  preview: { columns: CsvColumnPreview[] } | null;
  inputSchemaKeys?: string[];
  expectedOutputSchemaKeys?: string[];
}): CsvMapping & CsvMappingActions {
  const hasInputSchema = inputSchemaKeys && inputSchemaKeys.length > 0;
  const hasExpectedSchema =
    expectedOutputSchemaKeys && expectedOutputSchemaKeys.length > 0;

  const [mapping, setMapping] = useState<CsvMapping>(() => ({
    input: hasInputSchema
      ? createSchemaField(inputSchemaKeys)
      : createFreeformField(),
    expectedOutput: hasExpectedSchema
      ? createSchemaField(expectedOutputSchemaKeys)
      : createFreeformField(),
    metadata: [],
  }));

  // Initialize defaults for freeform mode
  useEffect(() => {
    if (!preview) return;

    const isInitialized =
      (isFreeformField(mapping.input) && mapping.input.columns.length > 0) ||
      (isFreeformField(mapping.expectedOutput) &&
        mapping.expectedOutput.columns.length > 0) ||
      mapping.metadata.length > 0;

    if (!hasInputSchema && !hasExpectedSchema && !isInitialized) {
      const defaultInput = findDefaultColumn(preview.columns, "Input", 0);
      const defaultExpected = findDefaultColumn(preview.columns, "Expected", 1);
      const defaultMetadata = findDefaultColumn(preview.columns, "Metadata", 2);

      const inputColumn = defaultInput
        ? preview.columns.find((c) => c.name === defaultInput)
        : undefined;
      const expectedColumn = defaultExpected
        ? preview.columns.find((c) => c.name === defaultExpected)
        : undefined;
      const metadataColumn = defaultMetadata
        ? preview.columns.find((c) => c.name === defaultMetadata)
        : undefined;

      setMapping((prev) => ({
        input: isFreeformField(prev.input)
          ? {
              type: FieldMappingType.FREEFORM,
              columns: inputColumn ? [inputColumn] : [],
            }
          : prev.input,
        expectedOutput: isFreeformField(prev.expectedOutput)
          ? {
              type: FieldMappingType.FREEFORM,
              columns: expectedColumn ? [expectedColumn] : [],
            }
          : prev.expectedOutput,
        metadata: metadataColumn ? [metadataColumn] : [],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, hasInputSchema, hasExpectedSchema]);

  const addColumnToInput = (column: CsvColumnPreview, key?: string) => {
    setMapping((prev) => {
      if (isFreeformField(prev.input)) {
        return {
          ...prev,
          input: {
            type: FieldMappingType.FREEFORM,
            columns: [...prev.input.columns, column],
          },
        };
      } else if (key) {
        return {
          ...prev,
          input: {
            type: FieldMappingType.SCHEMA,
            entries: prev.input.entries.map((entry) =>
              entry.key === key
                ? { ...entry, columns: [...entry.columns, column] }
                : entry,
            ),
          },
        };
      }
      return prev;
    });
  };

  const addColumnToExpectedOutput = (
    column: CsvColumnPreview,
    key?: string,
  ) => {
    setMapping((prev) => {
      if (isFreeformField(prev.expectedOutput)) {
        return {
          ...prev,
          expectedOutput: {
            type: FieldMappingType.FREEFORM,
            columns: [...prev.expectedOutput.columns, column],
          },
        };
      } else if (key) {
        return {
          ...prev,
          expectedOutput: {
            type: FieldMappingType.SCHEMA,
            entries: prev.expectedOutput.entries.map((entry) =>
              entry.key === key
                ? { ...entry, columns: [...entry.columns, column] }
                : entry,
            ),
          },
        };
      }
      return prev;
    });
  };

  const addColumnToMetadata = (column: CsvColumnPreview) => {
    setMapping((prev) => ({
      ...prev,
      metadata: [...prev.metadata, column],
    }));
  };

  const removeColumnFromInput = (columnName: string, key?: string) => {
    setMapping((prev) => {
      if (isFreeformField(prev.input)) {
        return {
          ...prev,
          input: {
            type: FieldMappingType.FREEFORM,
            columns: prev.input.columns.filter((c) => c.name !== columnName),
          },
        };
      } else if (key) {
        return {
          ...prev,
          input: {
            type: FieldMappingType.SCHEMA,
            entries: prev.input.entries.map((entry) =>
              entry.key === key
                ? {
                    ...entry,
                    columns: entry.columns.filter((c) => c.name !== columnName),
                  }
                : entry,
            ),
          },
        };
      }
      return prev;
    });
  };

  const removeColumnFromExpectedOutput = (columnName: string, key?: string) => {
    setMapping((prev) => {
      if (isFreeformField(prev.expectedOutput)) {
        return {
          ...prev,
          expectedOutput: {
            type: FieldMappingType.FREEFORM,
            columns: prev.expectedOutput.columns.filter(
              (c) => c.name !== columnName,
            ),
          },
        };
      } else if (key) {
        return {
          ...prev,
          expectedOutput: {
            type: FieldMappingType.SCHEMA,
            entries: prev.expectedOutput.entries.map((entry) =>
              entry.key === key
                ? {
                    ...entry,
                    columns: entry.columns.filter((c) => c.name !== columnName),
                  }
                : entry,
            ),
          },
        };
      }
      return prev;
    });
  };

  const removeColumnFromMetadata = (columnName: string) => {
    setMapping((prev) => ({
      ...prev,
      metadata: prev.metadata.filter((c) => c.name !== columnName),
    }));
  };

  const removeColumnFromAll = (columnName: string) => {
    setMapping((prev) => {
      const newInput: FieldMapping = isFreeformField(prev.input)
        ? {
            type: FieldMappingType.FREEFORM,
            columns: prev.input.columns.filter((c) => c.name !== columnName),
          }
        : {
            type: FieldMappingType.SCHEMA,
            entries: prev.input.entries.map((entry) => ({
              ...entry,
              columns: entry.columns.filter((c) => c.name !== columnName),
            })),
          };

      const newExpectedOutput: FieldMapping = isFreeformField(
        prev.expectedOutput,
      )
        ? {
            type: FieldMappingType.FREEFORM,
            columns: prev.expectedOutput.columns.filter(
              (c) => c.name !== columnName,
            ),
          }
        : {
            type: FieldMappingType.SCHEMA,
            entries: prev.expectedOutput.entries.map((entry) => ({
              ...entry,
              columns: entry.columns.filter((c) => c.name !== columnName),
            })),
          };

      return {
        input: newInput,
        expectedOutput: newExpectedOutput,
        metadata: prev.metadata.filter((c) => c.name !== columnName),
      };
    });
  };

  const isEmpty = () => {
    const inputEmpty = isFreeformField(mapping.input)
      ? mapping.input.columns.length === 0
      : mapping.input.entries.every((e) => e.columns.length === 0);

    const expectedOutputEmpty = isFreeformField(mapping.expectedOutput)
      ? mapping.expectedOutput.columns.length === 0
      : mapping.expectedOutput.entries.every((e) => e.columns.length === 0);

    return inputEmpty && expectedOutputEmpty;
  };

  const reset = () => {
    setMapping({
      input: hasInputSchema
        ? createSchemaField(inputSchemaKeys!)
        : createFreeformField(),
      expectedOutput: hasExpectedSchema
        ? createSchemaField(expectedOutputSchemaKeys!)
        : createFreeformField(),
      metadata: [],
    });
  };

  return {
    ...mapping,
    addColumnToInput,
    addColumnToExpectedOutput,
    addColumnToMetadata,
    removeColumnFromInput,
    removeColumnFromExpectedOutput,
    removeColumnFromMetadata,
    removeColumnFromAll,
    isEmpty,
    reset,
  };
}
