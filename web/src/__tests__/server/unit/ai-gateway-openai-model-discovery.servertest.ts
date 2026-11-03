import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openAiModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/adapters/openAi";

const openAiModels = [
  { id: "gpt-realtime", created: 1, shutdown_date: "2027-01-20" },
  { id: "tts-1-hd", created: 1, shutdown_date: "2027-01-06" },
  { id: "gpt-realtime-1.5", created: 1, shutdown_date: null },
  { id: "gpt-5.2-pro", created: 1, shutdown_date: null },
  { id: "gpt-5-chat-latest", created: 1, shutdown_date: "2026-07-23" },
  { id: "gpt-4o-2024-11-20", created: 1, shutdown_date: "2027-01-14" },
  { id: "gpt-4o-mini", created: 1 },
  { id: "unparsable-shutdown", created: 1, shutdown_date: "soon" },
  { id: "non-string-shutdown", created: 1, shutdown_date: 20260101 },
];

const fetchCatalog = () =>
  openAiModelDiscoveryAdapter.fetchCatalog({
    credential: "sk-test",
    fetcher: async () => Response.json({ data: openAiModels }),
  });

describe("OpenAI model discovery", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops models whose shutdown date has passed", async () => {
    const result = await fetchCatalog();

    expect(result.success && result.models.map(({ id }) => id)).toEqual([
      "gpt-realtime",
      "tts-1-hd",
      "gpt-realtime-1.5",
      "gpt-5.2-pro",
      "gpt-4o-2024-11-20",
      "gpt-4o-mini",
      "unparsable-shutdown",
      "non-string-shutdown",
    ]);
  });

  it("drops a model from the start of its shutdown day", async () => {
    vi.setSystemTime(new Date("2027-01-06T00:00:01Z"));

    const result = await fetchCatalog();

    expect(result.success && result.models.map(({ id }) => id)).not.toContain(
      "tts-1-hd",
    );
  });
});
