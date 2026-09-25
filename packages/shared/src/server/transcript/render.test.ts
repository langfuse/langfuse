import { describe, expect, it } from "vitest";
import { convertObservation } from "../repositories/observations_converters";
import { createObservation } from "../test-utils";
import { inheritedConversationHistoryFixture } from "./fixtures/trace/inherited-conversation-history";
import { standaloneToolObservationFixture } from "./fixtures/trace/standalone-tool-observation";
import { orderObservations } from "./ordering";
import { renderTranscript, renderTranscriptFromObservations } from "./render";
import { topicsTranscriptConfig } from "./render-config";
import { assembleTranscript } from "./transcript";

describe("Topics transcript renderer", () => {
  it("renders an existing assembly identically to the observations-only path", () => {
    const observations = inheritedConversationHistoryFixture.observations.map(
      (observation) => convertObservation(createObservation(observation)),
    );
    const assembled = assembleTranscript(orderObservations(observations));
    const result = renderTranscript(
      assembled,
      observations,
      topicsTranscriptConfig,
    );

    expect(result).toEqual(
      renderTranscriptFromObservations(observations, topicsTranscriptConfig),
    );
    expect(result.text).toBe(
      "--- earlier conversation ---\n[user] Initial request\n[assistant] First response\n--- this trace ---\n[user] Follow-up request\n[assistant] Second response",
    );
    expect(result.stats.historyCharacters).toBeGreaterThan(0);
    expect(result.stats.currentTurnCharacters).toBeGreaterThan(0);
    expect(result.tokens).toBeNull();

    const reversedObservations = standaloneToolObservationFixture.observations
      .map((observation) => convertObservation(createObservation(observation)))
      .reverse();
    const ordered = orderObservations(reversedObservations);
    expect(
      renderTranscriptFromObservations(
        reversedObservations,
        topicsTranscriptConfig,
      ),
    ).toEqual(
      renderTranscript(
        assembleTranscript(ordered),
        ordered,
        topicsTranscriptConfig,
      ),
    );
  });

  it("counts characters before and after the Topics block cap", () => {
    const userText = "x".repeat(2200);
    const observations = [
      convertObservation(
        createObservation({
          type: "GENERATION",
          input: JSON.stringify([{ role: "user", content: userText }]),
          output: JSON.stringify({ role: "assistant", content: "Done" }),
        }),
      ),
    ];
    const result = renderTranscript(
      assembleTranscript(orderObservations(observations)),
      observations,
      topicsTranscriptConfig,
    );

    expect(result.stats.blockCharacters.user.raw).toBe(userText.length);
    expect(result.stats.blockCharacters.user.clipped).toBeLessThan(
      userText.length,
    );
    expect(result.stats.blocksCut).toBe(1);
    expect(result.stats.messagesOmitted).toBe(0);
    expect(result.text).toContain("[200 chars omitted]");
    expect(result.text).toContain("[assistant] Done");
  });
});
