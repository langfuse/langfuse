import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type Session } from "next-auth";

import { canViewTraceTranscriptsEvals } from "./transcriptEvalsAccess";

const projectId = "project-1";

function session(): Session {
  return {
    expires: "1",
    environment: { enableExperimentalFeatures: false },
    user: {
      id: "user-a",
      email: "member@clickhouse.com",
      // Stale: the user already turned internal features off, but this session
      // copy still says they are on.
      featureFlags: testFeatureFlags({
        internalFeatures: true,
        langfuseTopics: false,
      }),
      organizations: [
        {
          id: "org-a",
          role: "VIEWER",
          projects: [{ id: projectId, role: "VIEWER" }],
        },
      ],
    },
  } as unknown as Session;
}

describe("canViewTraceTranscriptsEvals", () => {
  it("uses the current internal-view setting, not a stale session flag", () => {
    const project = { id: projectId, topicsEnabled: true };

    expect(canViewTraceTranscriptsEvals(session(), project, false)).toBe(false);
    expect(canViewTraceTranscriptsEvals(session(), project, true)).toBe(true);
  });
});
