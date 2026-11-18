import { test } from "vitest";
import { generateVertexAccessTokenForServiceAccount } from "@langfuse/shared/src/server";

const env = (name: string) => process.env[name];

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
      console.log(
        `[probe] ${label}: HTTP ${response.status} ${text.slice(0, 300)}`,
      );
      return;
    }
    const ids = pick(JSON.parse(text))
      .filter((id) => match.test(id))
      .sort();
    console.log(`[probe] ${label}: ${JSON.stringify(ids)}`);
  } catch (error) {
    console.log(`[probe] ${label}: ${String(error)}`);
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
    console.log(`[probe] bedrock region: ${region}`);
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
      "https://aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=1000&listAllVersions=true",
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
}, 60_000);
