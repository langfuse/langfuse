import { test, vi } from "vitest";

const raw = vi.hoisted(() => [] as string[]);
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/topics/server")>();
  return {
    ...actual,
    generateTopicText: async (
      params: Parameters<typeof actual.generateTopicText>[0],
    ) => {
      try {
        return await actual.generateTopicText(params);
      } catch (error: any) {
        raw.push(
          `text=${JSON.stringify(error?.text)} cause=${String(error?.cause?.message ?? error?.cause ?? "").slice(0, 800)}`,
        );
        throw error;
      }
    },
  };
});
import { generateVertexAccessTokenForServiceAccount } from "@langfuse/shared/src/server";
import { nameTopicGroup, prepareTopicNamingGroup } from "./models";
import {
  resolveTopicsLlmCombination,
  TOPICS_LLM_COMBINATIONS,
} from "./topicsLlmCombinations";

const env = (name: string) => process.env[name];
const lines: string[] = [];

async function list(
  label: string,
  url: string,
  headers: Record<string, string>,
  pick: (body: any) => string[],
  match: RegExp,
) {
  try {
    const response = await fetch(url, { headers });
    const text = await response.text();
    if (!response.ok) {
      lines.push(
        `[probe] ${label}: HTTP ${response.status} ${text.slice(0, 300)}`,
      );
      return;
    }
    const ids = pick(JSON.parse(text))
      .filter((id) => match.test(id))
      .sort();
    lines.push(`[probe] ${label}: ${JSON.stringify(ids)}`);
  } catch (error) {
    lines.push(`[probe] ${label}: ${String(error)}`);
  }
}

test("list live model ids", async () => {
  const openai = env("LANGFUSE_LLM_CONNECTION_OPENAI_KEY");
  if (openai)
    await list(
      "openai",
      "https://api.openai.com/v1/models",
      { Authorization: `Bearer ${openai}` },
      (b) => b.data.map((m: any) => m.id),
      /luna|gpt-6/,
    );

  const anthropic = env("LANGFUSE_LLM_CONNECTION_ANTHROPIC_KEY");
  if (anthropic)
    await list(
      "anthropic",
      "https://api.anthropic.com/v1/models?limit=1000",
      { "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
      (b) => b.data.map((m: any) => m.id),
      /haiku/,
    );

  const bedrockKey = env("LANGFUSE_LLM_CONNECTION_BEDROCK_API_KEY");
  const region = env("LANGFUSE_LLM_CONNECTION_BEDROCK_REGION");
  if (bedrockKey && region) {
    lines.push(`[probe] bedrock region: ${region}`);
    await list(
      "bedrock inference profiles",
      `https://bedrock.${region}.amazonaws.com/inference-profiles?typeEquals=SYSTEM_DEFINED&maxResults=1000`,
      { Authorization: `Bearer ${bedrockKey}` },
      (b) =>
        b.inferenceProfileSummaries.map(
          (p: any) => `${p.inferenceProfileId} (${p.status})`,
        ),
      /haiku/,
    );
  }

  const vertexKey = env("LANGFUSE_LLM_CONNECTION_VERTEXAI_KEY");
  if (vertexKey) {
    const key = JSON.parse(vertexKey);
    const token = await generateVertexAccessTokenForServiceAccount(key);
    await list(
      "vertex publisher models",
      "https://aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=300&listAllVersions=true",
      {
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": key.project_id,
      },
      (b) =>
        (b.publisherModels ?? []).map(
          (m: any) => `${m.name} ${m.launchStage ?? ""}`,
        ),
      /gemini-[3-9]/,
    );
  }
  const haiku = TOPICS_LLM_COMBINATIONS.find(
    (c) => c.summary.model === "claude-haiku-5-5",
  );
  const prepared = await prepareTopicNamingGroup(
    {
      members: [
        "Export last month's orders to CSV after the full export timed out.",
        "Export a quarter of invoices to CSV split into smaller files.",
        "Download the customer list as a spreadsheet after a failed export.",
        "Export order history to CSV grouped by region.",
      ].map((summary) => ({ summary })),
      contrasts: [
        { id: "c1", summary: "Translate a product description into German." },
      ],
    },
    "topics-llm-provider-test",
  );
  if (haiku && anthropic) {
    const { models } = resolveTopicsLlmCombination(haiku);
    for (let i = 0; i < 5; i++) {
      try {
        await nameTopicGroup(models, { ...prepared, facetName: "Intent" });
        lines.push(`[probe] haiku naming ${i}: ok`);
      } catch (error) {
        const chain: string[] = [];
        let current: any = error;
        while (current) {
          chain.push(
            `${current.name}: ${current.text ?? current.message ?? ""}`.slice(
              0,
              600,
            ),
          );
          current = current.cause;
        }
        lines.push(
          `[probe] haiku naming ${i}: ${chain.join(" <- ")} | ${raw.at(-1) ?? "no raw"}`,
        );
      }
    }
  }
  if (vertexKey && prepared) {
    for (const model of [
      "gemini-4-argon",
      "gemini-4-carbon",
      "gemini-4-hydrogen",
      "gemini-3.8-flash",
    ]) {
      const { models } = resolveTopicsLlmCombination({
        name: `Vertex ${model}`,
        summary: { connection: "vertex", model },
        embedding: {
          connection: "vertex",
          model: "text-embedding-005",
          dimensions: 768,
        },
        clustering: { connection: "vertex", model },
      });
      try {
        await nameTopicGroup(models, { ...prepared, facetName: "Intent" });
        lines.push(`[probe] vertex ${model} naming: ok`);
      } catch (error: any) {
        lines.push(
          `[probe] vertex ${model} naming: ${String(error?.message).slice(0, 300)} | ${raw.at(-1) ?? ""}`,
        );
      }
    }
  }
  throw new Error(`[probe results]\n${lines.join("\n")}`);
}, 60_000);
