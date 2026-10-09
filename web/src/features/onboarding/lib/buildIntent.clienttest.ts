import {
  BUILD_INTENT_IDS,
  type BuildIntentId,
  getSurveySubmittedEvent,
  shuffleBuildIntentOptions,
  toggleBuildIntent,
} from "./buildIntent";

describe("shuffleBuildIntentOptions", () => {
  it("keeps every option once and pins exploring and other last", () => {
    const ids = shuffleBuildIntentOptions().map((option) => option.id);

    expect([...ids].sort()).toEqual([...BUILD_INTENT_IDS].sort());
    expect(ids.slice(-2)).toEqual(["just_exploring", "other"]);
  });
});

describe("toggleBuildIntent", () => {
  it("adds and removes picks", () => {
    expect(toggleBuildIntent(["rag"], "chat_agent", true)).toEqual([
      "rag",
      "chat_agent",
    ]);
    expect(toggleBuildIntent(["rag", "chat_agent"], "rag", false)).toEqual([
      "chat_agent",
    ]);
  });

  it("ignores a fourth pick", () => {
    const threePicks = toggleBuildIntent(
      toggleBuildIntent(["rag"], "chat_agent", true),
      "other",
      true,
    );

    expect(toggleBuildIntent(threePicks, "coding_agents", true)).toEqual(
      threePicks,
    );
  });

  it("makes just exploring exclusive in both directions", () => {
    expect(
      toggleBuildIntent(["rag", "chat_agent"], "just_exploring", true),
    ).toEqual(["just_exploring"]);
    expect(toggleBuildIntent(["just_exploring"], "rag", true)).toEqual(["rag"]);
  });
});

describe("getSurveySubmittedEvent", () => {
  const submit = {
    surveyCreated: true,
    buildIntents: ["rag"] as BuildIntentId[],
    hasReferralSource: true,
    surveyDurationMs: 4200,
  };

  it("sends metadata and sets the picks once on the person", () => {
    expect(
      getSurveySubmittedEvent({ ...submit, buildIntents: ["rag", "other"] }),
    ).toEqual({
      properties: {
        buildIntents: ["rag", "other"],
        buildIntentCount: 2,
        hasReferralSource: true,
        surveyDurationMs: 4200,
      },
      options: { $set_once: { onboardingBuildIntents: ["rag", "other"] } },
    });
  });

  it("records a skip without setting the person property", () => {
    expect(
      getSurveySubmittedEvent({ ...submit, buildIntents: [] }),
    ).toMatchObject({
      properties: { buildIntents: [], buildIntentCount: 0 },
      options: undefined,
    });
  });

  it("sends nothing when an earlier submit already stored the survey", () => {
    expect(
      getSurveySubmittedEvent({
        ...submit,
        buildIntents: ["rag"],
        surveyCreated: false,
      }),
    ).toBeNull();
  });
});
