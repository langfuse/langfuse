import { describe, expect, it } from "vitest";
import {
  extractSchemaFields,
  generateEntriesFromSchema,
} from "./extractSchemaFields";

describe("schema-derived dataset mappings", () => {
  it("does not lock a required child of an optional object into the mapping", () => {
    const fields = extractSchemaFields({
      type: "object",
      required: ["question"],
      properties: {
        question: { type: "string" },
        context: {
          type: "object",
          required: ["source"],
          properties: { source: { type: "string" } },
        },
      },
    });

    expect(
      fields.find((field) => field.path === "context.source")?.required,
    ).toBe(false);
    expect(
      generateEntriesFromSchema(fields, "input").map((entry) => entry.key),
    ).toEqual(["question", "context"]);
  });

  it("keeps descendants required when every ancestor is required", () => {
    const fields = extractSchemaFields({
      type: "object",
      required: ["context"],
      properties: {
        context: {
          type: "object",
          required: ["source"],
          properties: { source: { type: "string" } },
        },
      },
    });

    expect(generateEntriesFromSchema(fields, "input")).toEqual([
      expect.objectContaining({ key: "context", isRequired: true }),
      expect.objectContaining({ key: "context.source", isRequired: true }),
    ]);
  });

  it("propagates an optional ancestor through required intermediate objects", () => {
    const fields = extractSchemaFields({
      type: "object",
      properties: {
        context: {
          type: "object",
          required: ["document"],
          properties: {
            document: {
              type: "object",
              required: ["source"],
              properties: { source: { type: "string" } },
            },
          },
        },
      },
    });

    expect(fields.every((field) => !field.required)).toBe(true);
    expect(
      generateEntriesFromSchema(fields, "input").map((entry) => entry.key),
    ).toEqual(["context"]);
  });

  it("does not require children when a required object can be null", () => {
    const fields = extractSchemaFields({
      type: "object",
      required: ["context"],
      properties: {
        context: {
          type: ["object", "null"],
          required: ["source"],
          properties: { source: { type: "string" } },
        },
      },
    });

    expect(generateEntriesFromSchema(fields, "input")).toEqual([
      expect.objectContaining({ key: "context", isRequired: true }),
    ]);
  });
});
