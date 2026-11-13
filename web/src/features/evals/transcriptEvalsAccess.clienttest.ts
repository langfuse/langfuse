import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { type Flags } from "@/src/features/feature-flags/types";
import { type Session } from "next-auth";

import { canViewTraceTranscriptsEvals } from "./transcriptEvalsAccess";

const projectId = "project-1";

function session({
  email = "member@example.com",
  role = "VIEWER",
  ...flags
}: Partial<Flags> & { email?: string; role?: string | null }): Session {
  return {
    expires: "1",
    environment: { enableExperimentalFeatures: false },
    user: {
      id: "user-a",
      email,
      featureFlags: testFeatureFlags(flags),
      organizations: role
        ? [{ id: "org-a", role, projects: [{ id: projectId, role }] }]
        : [],
    },
  } as unknown as Session;
}

describe("canViewTraceTranscriptsEvals", () => {
  it.each([
    [
      "its own preview on a listed project",
      { traceTranscriptEvals: true },
      { traceEvalsEnabled: true },
      true,
    ],
    [
      "internal view on a listed project",
      { email: "member@clickhouse.com" },
      { traceEvalsEnabled: true },
      true,
    ],
    [
      "the Topics preview alone",
      { langfuseTopics: true },
      { traceEvalsEnabled: true },
      false,
    ],
    [
      "a project that is only on the Topics list",
      { traceTranscriptEvals: true },
      { topicsEnabled: true },
      false,
    ],
    [
      "internal view on an unlisted project",
      { email: "member@clickhouse.com" },
      { traceEvalsEnabled: false },
      false,
    ],
    [
      "its own preview without project membership",
      { traceTranscriptEvals: true, role: null },
      { traceEvalsEnabled: true },
      false,
    ],
  ] as const)("%s", (_case, user, project, expected) => {
    expect(
      canViewTraceTranscriptsEvals(session(user), {
        id: projectId,
        ...project,
      }),
    ).toBe(expected);
  });
});
