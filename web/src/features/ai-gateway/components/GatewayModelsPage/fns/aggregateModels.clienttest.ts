import { describe, expect, it } from "vitest";
import { aggregateModels } from "./aggregateModels";

type Connection = Parameters<typeof aggregateModels>[1][number];
type Result = Parameters<typeof aggregateModels>[0][number];

describe("aggregateModels", () => {
  it("returns one qualified row for each allowed connection and model pair", () => {
    const first = {
      id: "first",
      name: "First",
      provider: "OPENAI",
      allowedModels: null,
    } as Connection;
    const second = {
      id: "second",
      name: "Second",
      provider: "ANTHROPIC",
      allowedModels: ["shared-model"],
    } as Connection;
    const results = [
      {
        connectionId: "second",
        success: true,
        models: ["a-model", "shared-model"],
      },
      {
        connectionId: "first",
        success: true,
        models: ["z-model", "b-model", "shared-model"],
      },
    ] as Result[];

    expect(aggregateModels(results, [first, second])).toEqual([
      {
        connectionId: "first",
        connectionName: "First",
        id: "First:b-model",
        provider: "OPENAI",
        apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
      },
      {
        connectionId: "first",
        connectionName: "First",
        id: "First:shared-model",
        provider: "OPENAI",
        apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
      },
      {
        connectionId: "first",
        connectionName: "First",
        id: "First:z-model",
        provider: "OPENAI",
        apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
      },
      {
        connectionId: "second",
        connectionName: "Second",
        id: "Second:shared-model",
        provider: "ANTHROPIC",
        apiFormats: ["Anthropic Messages"],
      },
    ]);
  });

  it("hides disallowed models and ignores repeated connections", () => {
    const connection = {
      id: "first",
      name: "First",
      provider: "OPENAI",
      allowedModels: [] as string[],
    } as Connection;
    const result = {
      connectionId: "first",
      success: true,
      models: ["model"],
    } as Result;

    expect(aggregateModels([result], [connection, connection])).toEqual([]);
  });
});
