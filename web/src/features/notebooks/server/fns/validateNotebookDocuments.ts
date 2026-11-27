import { InvalidRequestError } from "@langfuse/shared";
import { ZodError } from "zod";
import {
  MAIN_NOTEBOOK_DOCUMENT,
  type NotebookLayout,
  type NotebookWiring,
} from "../../schema";
import { getNotebookLayoutDocumentIds } from "./getNotebookLayoutDocumentIds";
import { parseDocument } from "./parseDocument";
import { resolveNotebookPort } from "../../ports";
import { findNotebookBlock } from "./findNotebookBlock";
import { getNotebookPresentationWarnings } from "../../presentation";
import { hasMarkdownTable, markdownTableError } from "./findMarkdownTable";

export function validateNotebookDocuments(
  documents: readonly { documentId: string; jsonl: string }[],
  layout: NotebookLayout,
  checkLayout: boolean,
  wiring: NotebookWiring = layout,
) {
  const errors: { documentId?: string; blockId?: string; message: string }[] =
    [];
  const blocks = new Map<string, ReturnType<typeof parseDocument>>();
  const wide = layout.kind === "inbox" || layout.width === "full";
  const warnings: (ReturnType<
    typeof getNotebookPresentationWarnings
  >[number] & {
    documentId: string;
  })[] = [];
  if (checkLayout) {
    const existingIds = new Set(documents.map(({ documentId }) => documentId));
    const referencedIds = new Set(getNotebookLayoutDocumentIds(layout));
    for (const documentId of new Set([
      MAIN_NOTEBOOK_DOCUMENT,
      ...referencedIds,
    ])) {
      if (!existingIds.has(documentId)) {
        errors.push({ documentId, message: "Document does not exist." });
      }
    }
    for (const documentId of existingIds) {
      if (!referencedIds.has(documentId)) {
        errors.push({
          documentId,
          message:
            "The current view hides this document. Show it in the layout before publishing.",
        });
      }
    }
  }
  for (const { documentId, jsonl } of documents) {
    try {
      const parsed = parseDocument(jsonl, "validate");
      blocks.set(documentId, parsed);
      const pending = [...parsed];
      for (const block of pending) {
        if (block.schema === "row@1") pending.push(...block.props.children);
        if (block.schema === "text@1" && hasMarkdownTable(block.content)) {
          errors.push({
            documentId,
            blockId: block.id,
            message: markdownTableError,
          });
        }
      }
      for (const warning of getNotebookPresentationWarnings(parsed, wide)) {
        warnings.push({ documentId, ...warning });
      }
    } catch (error) {
      if (!(error instanceof InvalidRequestError || error instanceof ZodError))
        throw error;
      errors.push({ documentId, message: error.message });
    }
  }
  if (!checkLayout) return { errors, warnings };
  const variables = wiring.variables ?? [];
  const byId = new Map(variables.map((variable) => [variable.id, variable]));
  if (byId.size !== variables.length)
    errors.push({ message: "Variable IDs must be unique." });
  const inputs = new Set<string>();
  const domains = new Set<string>();
  for (const binding of wiring.bindings ?? []) {
    const ref = binding.kind === "read" ? binding.to : binding.from;
    const port = resolveNotebookPort(blocks.get(ref.documentId) ?? [], ref);
    const variable = byId.get(binding.variableId);
    const direction = binding.kind === "read" ? "input" : "output";
    if (
      !variable ||
      !port ||
      port.direction !== direction ||
      port.type !== variable.type
    ) {
      errors.push({
        documentId: ref.documentId,
        message: `Invalid ${binding.kind} binding for ${binding.variableId} at ${ref.elementId}.${ref.portId}.`,
      });
      continue;
    }
    if (port.direction === "input") {
      const key = `${ref.documentId}/${ref.elementId}/${ref.portId}`;
      if (inputs.has(key))
        errors.push({
          documentId: ref.documentId,
          message: `Input ${key} already has a binding.`,
        });
      inputs.add(key);
    } else {
      if ("liveSelectionValueField" in port) {
        const inputPort =
          port.liveSelectionValueField === "id"
            ? "observationId"
            : "resourceId";
        for (const consumer of wiring.bindings ?? []) {
          if (consumer.kind !== "read" || consumer.variableId !== variable.id)
            continue;
          const target = findNotebookBlock(
            blocks.get(consumer.to.documentId) ?? [],
            consumer.to.elementId,
          )?.block;
          if (
            consumer.to.documentId !== ref.documentId ||
            target?.schema !== "embed@1" ||
            target.props.target.kind !== "trace" ||
            consumer.to.portId !== inputPort
          ) {
            errors.push({
              documentId: consumer.to.documentId,
              blockId: consumer.to.elementId,
              message: `Live observation selection can only drive a trace embed's ${inputPort} input in the same document.`,
            });
          }
        }
      }
      if (domains.has(variable.id))
        errors.push({
          message: `Variable ${variable.id} already has a selection source.`,
        });
      domains.add(variable.id);
    }
  }
  return { errors, warnings };
}
