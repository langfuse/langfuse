import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { IssueDetectionView } from "./IssueDetectionView";

const meta = preview.meta({ component: IssueDetectionView });

export const Default = meta.story({
  args: {
    busyIssueId: null,
    onIgnore: fn(),
    onDone: fn(),
    issues: [
      {
        id: "1",
        ruleName: "Traces rejected by ingestion API",
        group: "integration",
        description:
          "12% of traces were rejected. [Check API keys](/settings/api-keys).",
        priority: 0,
        ctaLink: "/traces",
        ctaLabel: "View traces",
        createdAt: new Date("2026-09-30T12:00:00Z"),
        doneAt: null,
        ignoredAt: null,
      },
      {
        id: "2",
        ruleName: "Set up evaluators",
        group: "evaluations",
        description: "Set up evaluators to monitor your observations.",
        priority: 3,
        ctaLink: null,
        ctaLabel: "Create evaluator",
        createdAt: new Date("2026-09-30T10:00:00Z"),
        doneAt: null,
        ignoredAt: null,
      },
    ],
  },
});

export const Empty = meta.story({
  args: { issues: [], busyIssueId: null, onIgnore: fn(), onDone: fn() },
});
