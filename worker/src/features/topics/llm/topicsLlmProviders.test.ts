import { describe, expect, test } from "vitest";
import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import {
  embedTopicSummaries,
  nameTopicGroup,
  prepareTopicNamingGroup,
  summarizeTopicTraceFacets,
} from "./models";
import {
  resolveTopicsLlmCombination,
  TOPICS_LLM_COMBINATIONS,
} from "./__tests__/topicsLlmCombinations";

/**
 * Topics LLM provider tests
 *
 * Real summary, embedding and naming calls for every combination registered
 * in `topicsLlmCombinations.ts`, using the same prompts, schemas and parsing
 * as processing. They assert that each call succeeds and returns a parseable,
 * non-empty result, never what the model wrote.
 *
 * Requires the `LANGFUSE_LLM_CONNECTION_*` secrets of llmConnections.test.ts;
 * a combination whose secrets are missing fails.
 */

const TIMEOUT_MS = 120_000;

const facets = DEFAULT_TOPIC_FACETS.map(({ name, prompt }, index) => ({
  key: `${name.toLowerCase()}_${index + 1}`,
  facet: {
    projectId: "topics-llm-provider-test",
    facetId: `facet-${index + 1}`,
    version: 1,
    prompt,
    createdAt: new Date(0).toISOString(),
  },
  builtIn: true,
}));

const transcript = `<run_facts>user messages: 2; assistant messages: 2; tool calls: 1; tool errors: 1</run_facts>
<this_run>
[user · request] My CSV export of last month's orders keeps timing out. Can you get it working?
[assistant → run_export #1] {"range":"last_month","format":"csv"}
[tool run_export #1 ←] ERROR: export timed out after 30s
[assistant] The full month timed out, so I split the export into four weekly files and attached them.
[user · request] Thanks, the weekly files opened fine.
[assistant] Glad that worked.
</this_run>
<end_of_run>assistant reply</end_of_run>`;

const summaries = [
  "Export last month's orders to CSV after the full export timed out.",
  "Export a quarter of invoices to CSV split into smaller files.",
  "Download the customer list as a spreadsheet after a failed export.",
  "Export order history to CSV grouped by region.",
];

describe("Topics LLM provider tests", () => {
  for (const combination of TOPICS_LLM_COMBINATIONS) {
    describe(combination.name, () => {
      test(
        `facet summarization (${combination.summary.model})`,
        async () => {
          const { models, config } = resolveTopicsLlmCombination(combination);

          const { output } = await summarizeTopicTraceFacets(
            models,
            facets,
            transcript,
            config,
          );

          const entries = output as Record<string, { summary: string }>;
          expect(Object.keys(entries).sort()).toEqual(
            facets.map(({ key }) => key).sort(),
          );
          expect(
            Object.values(entries).some(
              ({ summary }) => summary.trim().length > 0,
            ),
          ).toBe(true);
        },
        TIMEOUT_MS,
      );

      test(
        `summary embeddings (${combination.embedding.model})`,
        async () => {
          const { models } = resolveTopicsLlmCombination(combination);

          const { embeddings } = await embedTopicSummaries(
            models.embedding,
            summaries.slice(0, 2),
            models.embedding.dimensions,
            models.projectId,
          );

          expect(embeddings).toHaveLength(2);
          for (const vector of embeddings)
            expect(vector).toHaveLength(models.embedding.dimensions);
        },
        TIMEOUT_MS,
      );

      test(
        `cluster naming (${combination.clustering.model})`,
        async () => {
          const { models } = resolveTopicsLlmCombination(combination);
          const prepared = await prepareTopicNamingGroup(
            {
              members: summaries.map((summary) => ({ summary })),
              contrasts: [
                {
                  id: "c1",
                  summary: "Translate a product description into German.",
                },
              ],
            },
            "topics-llm-provider-test",
          );

          const { output } = await nameTopicGroup(models, {
            ...prepared,
            facetName: "Intent",
          });

          expect(output.name.trim()).not.toBe("");
          expect(output.description.trim()).not.toBe("");
          expect(output.evidenceSummaryIds.length).toBeGreaterThan(0);
        },
        TIMEOUT_MS,
      );
    });
  }
});
