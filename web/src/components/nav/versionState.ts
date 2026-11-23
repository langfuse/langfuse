import { planLabels, type Plan } from "@langfuse/shared";
import { VERSION } from "@/src/constants/VERSION";

type SelfHostedPlan = Extract<Plan, "oss" | `self-hosted:${string}`>;

export type SidebarVersionState =
  | { deployment: "cloud" }
  | {
      deployment: "self-hosted";
      plan: SelfHostedPlan;
      release:
        | { status: "current" }
        | {
            status: "update-available";
            updateType: "major" | "minor" | "patch";
            latestRelease: string;
          };
      migration: { status: "idle" } | { status: "in-progress"; phase: string };
    };

const selfHostedPlanLabels = {
  oss: { short: "OSS", long: "Open source" },
  "self-hosted:pro": {
    short: "Pro",
    long: planLabels["self-hosted:pro"],
  },
  "self-hosted:enterprise": {
    short: "EE",
    long: planLabels["self-hosted:enterprise"],
  },
  "self-hosted:gov": {
    short: "Gov",
    long: planLabels["self-hosted:gov"],
  },
} satisfies Record<SelfHostedPlan, { short: string; long: string }>;

/** What the version badge and its menu show for a deployment. */
export function describeVersionState(
  state: SidebarVersionState,
  version: string = VERSION,
) {
  const selfHostedPlanLabel =
    state.deployment === "self-hosted"
      ? selfHostedPlanLabels[state.plan]
      : null;
  const backgroundMigrationStatus =
    state.deployment === "self-hosted" &&
    state.migration.status === "in-progress"
      ? state.migration.phase
      : null;
  const update =
    state.deployment === "self-hosted" &&
    state.release.status === "update-available"
      ? state.release
      : null;
  const versionText = `${version}${
    selfHostedPlanLabel ? ` ${selfHostedPlanLabel.short}` : ""
  }`;
  return {
    selfHostedPlanLabel,
    backgroundMigrationStatus,
    update,
    versionText,
  };
}
