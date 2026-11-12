import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type Flags } from "@/src/features/feature-flags/types";
import { type Session } from "next-auth";

import { canViewTraceTranscriptsEvals } from "./transcriptEvalsAccess";

const projectId = "project-1";
const project = { id: projectId, topicsEnabled: true };

// Staff email with a stale `internalFeatures: true`: the user already turned
// internal view off, but this session copy still says it is on.
function session(flags: Partial<Flags>): Session {
  return {
    expires: "1",
    environment: { enableExperimentalFeatures: false },
    user: {
      id: "user-a",
      email: "member@clickhouse.com",
      featureFlags: testFeatureFlags({ internalFeatures: true, ...flags }),
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
  it("needs the current internal view or its own preview flag", () => {
    const topicsOnly = session({
      langfuseTopics: true,
      traceTranscriptEvals: false,
    });
    const evalsPreview = session({
      langfuseTopics: false,
      traceTranscriptEvals: true,
    });

    expect(canViewTraceTranscriptsEvals(topicsOnly, project, false)).toBe(
      false,
    );
    expect(canViewTraceTranscriptsEvals(evalsPreview, project, false)).toBe(
      true,
    );
    expect(canViewTraceTranscriptsEvals(topicsOnly, project, true)).toBe(true);
  });
});
