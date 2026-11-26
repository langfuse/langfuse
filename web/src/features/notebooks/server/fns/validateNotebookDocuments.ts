import { InvalidRequestError } from "@langfuse/shared";
import { ZodError } from "zod";
import { MAIN_NOTEBOOK_DOCUMENT, type NotebookLayout } from "../../schema";
import { getNotebookLayoutDocumentIds } from "./getNotebookLayoutDocumentIds";
import { parseDocument } from "./parseDocument";
import { resolveNotebookPort } from "../../ports";
import { getNotebookPresentationWarnings } from "../../presentation";

export function validateNotebookDocuments(
  documents: readonly { documentId: string; jsonl: string }[],
  layout: NotebookLayout,
  checkLayout: boolean,
) {
  const errors: { documentId?: string; message: string }[] = [];
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
  const variables = layout.variables ?? [];
  const byId = new Map(variables.map((variable) => [variable.id, variable]));
  if (byId.size !== variables.length)
    errors.push({ message: "Variable IDs must be unique." });
  const inputs = new Set<string>();
  const domains = new Set<string>();
  for (const binding of layout.bindings ?? []) {
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
      if (domains.has(variable.id))
        errors.push({
          message: `Variable ${variable.id} already has a selection source.`,
        });
      domains.add(variable.id);
    }
  }
  return { errors, warnings };
}
