import { buildPromptPageContext } from "@/src/features/page-context/fns/buildPromptPageContext";
import {
  PAGE_CONTEXT_LIMITS,
  PageContextSnapshotSchema,
} from "@/src/features/page-context/types";

const prompt = {
  name: "support/reply-drafter",
  version: 7,
  type: "chat",
  labels: ["production", "latest"],
  tags: ["support"],
  config: { model: "gpt-4.1", temperature: 0.2 },
  prompt: [{ role: "system", content: "You draft replies." }],
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
};

describe("buildPromptPageContext", () => {
  it("describes the prompt version on screen", () => {
    const snapshot = buildPromptPageContext({
      prompt,
      versionCount: 7,
      path: "/project/p/prompts/support%2Freply-drafter?version=7",
    });

    expect(PageContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot).toMatchObject({
      kind: "prompt",
      id: "support/reply-drafter@7",
      title: "support/reply-drafter",
    });
    expect(
      Object.fromEntries(
        snapshot.facts.map((item) => [item.key, item.display]),
      ),
    ).toMatchObject({
      version: "v7",
      type: "Chat",
      labels: "production, latest",
      versions: "7",
      model: "gpt-4.1",
      tags: "support",
      created_at: "2026-01-02",
    });
  });

  it("bounds a long prompt body to a preview", () => {
    const snapshot = buildPromptPageContext({
      prompt: { ...prompt, prompt: "x".repeat(50_000), config: null },
      versionCount: 1,
      path: "/project/p/prompts/support",
    });
    const content = snapshot.facts.find((item) => item.key === "content");

    expect(content?.display.length).toBeLessThanOrEqual(
      PAGE_CONTEXT_LIMITS.factDisplay,
    );
    expect(String(content?.value).length).toBeLessThanOrEqual(
      PAGE_CONTEXT_LIMITS.factValue,
    );
    expect(snapshot.facts.map((item) => item.key)).not.toContain("model");
  });
});
