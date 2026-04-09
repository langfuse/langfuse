import type { SpielwieseDashboardVM } from "../types/dashboard";

export const spielwieseDashboardMock: SpielwieseDashboardVM = {
  header: {
    eyebrow: "Preset-driven shell",
    title: "A cleaner command deck for prompt iteration and review.",
    description:
      "Spielwiese starts from a local shell, warm paper surfaces, and deliberate hierarchy so the redesign can scale beyond a one-off dashboard.",
  },
  metrics: [
    {
      id: "throughput",
      label: "Live review throughput for staged prompts",
      value: "128 / day",
      delta: "+12%",
      trend: "week over week",
      status: "spotlight",
    },
    {
      id: "latency",
      label: "Median end-to-end iteration turnaround",
      value: "6m 24s",
      delta: "-18%",
      trend: "vs. yesterday",
      status: "steady",
    },
    {
      id: "coverage",
      label: "Runs sampled into qualitative checkpoints",
      value: "84%",
      delta: "+9 pts",
      trend: "coverage target",
      status: "steady",
    },
    {
      id: "watch",
      label: "Prompt lanes needing human attention",
      value: "03",
      delta: "2 urgent",
      trend: "triage now",
      status: "watch",
    },
  ],
  insights: [
    {
      id: "lane-balance",
      kicker: "Lane health",
      title:
        "Shipping lanes are balanced, but risk is clustering in support triage.",
      summary:
        "Most review work is moving faster, yet one lane is accumulating late-stage edits and rechecks.",
      cta: "Inspect lane",
    },
    {
      id: "signal-noise",
      kicker: "Signal quality",
      title:
        "Evaluator notes are landing earlier, which makes the overview feel more actionable.",
      summary:
        "Notes now arrive before export prep, so reviewers can intervene before the summary hardens.",
      cta: "Open notes",
    },
    {
      id: "handoff",
      kicker: "Design handoff",
      title:
        "The new shell is proving which pieces should graduate into the main product chrome.",
      summary:
        "Navigation, right-rail context, and panel density are all cleaner in this isolated track.",
      cta: "Review shell",
    },
  ],
  activity: {
    title: "Review queue",
    description:
      "A compact right rail for active work, handoff notes, and the next decisions that need a human.",
    items: [
      {
        id: "triage-pass",
        label: "Safety pass pending",
        detail: "Support triage / Prompt v4",
        value: "09:40",
      },
      {
        id: "notes",
        label: "Designer note added",
        detail: "Dashboard shell / Density review",
        value: "10:15",
      },
      {
        id: "coverage",
        label: "Coverage dip detected",
        detail: "Monitor lane / Export preview",
        value: "11:02",
      },
      {
        id: "handoff",
        label: "Spec ready for handoff",
        detail: "Right rail / Copy polish",
        value: "11:47",
      },
    ],
  },
};
