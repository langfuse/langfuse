import { useState } from "react";
import { type DragEndEvent } from "@dnd-kit/core";
import { type CsvColumnPreview } from "@/src/features/datasets/lib/csv/types";

type DragHandlers = {
  onAddToInputColumn: (columnName: string) => void;
  onAddToExpectedColumn: (columnName: string) => void;
  onAddToMetadataColumn: (columnName: string) => void;
  onAddToInputSchemaKey: (schemaKey: string, column: CsvColumnPreview) => void;
  onAddToExpectedSchemaKey: (
    schemaKey: string,
    column: CsvColumnPreview,
  ) => void;
  onRemoveFromAllMappings: (columnName: string) => void;
};

export function useCsvDragAndDrop({ handlers }: { handlers: DragHandlers }) {
  const [activeColumn, setActiveColumn] = useState<string | null>(null);

  const handleDragStart = (event: { active: { id: unknown } }) => {
    setActiveColumn(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveColumn(null);

    if (!over) return;

    const fromCardId = active.data.current?.fromCardId;
    const column = active.data.current?.column as CsvColumnPreview;
    const toId = over.id as string;

    if (!column) return;

    // Only proceed if dropping on a valid drop zone
    const isValidDropZone =
      toId.includes(":") || // schema key drop zones
      toId === "input" ||
      toId === "expected" ||
      toId === "metadata";

    if (!isValidDropZone) return;

    // Remove from previous mappings if dragging from mapped card
    if (fromCardId === "mapped") {
      handlers.onRemoveFromAllMappings(column.name);
    }

    // Handle schema key drops (format: "input:key" or "expectedOutput:key")
    if (toId.includes(":")) {
      const [cardType, schemaKey] = toId.split(":");
      if (!schemaKey) return;

      if (cardType === "input") {
        handlers.onAddToInputSchemaKey(schemaKey, column);
      } else if (cardType === "expectedOutput") {
        handlers.onAddToExpectedSchemaKey(schemaKey, column);
      }
      return;
    }

    // Handle freeform drops (input, expected, metadata)
    if (toId === "input") {
      handlers.onAddToInputColumn(column.name);
    } else if (toId === "expected") {
      handlers.onAddToExpectedColumn(column.name);
    } else if (toId === "metadata") {
      handlers.onAddToMetadataColumn(column.name);
    }
  };

  return {
    activeColumn,
    handleDragStart,
    handleDragEnd,
  };
}
