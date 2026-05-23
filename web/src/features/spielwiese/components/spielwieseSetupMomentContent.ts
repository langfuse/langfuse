export type SpielwieseIntroTimelineEntry = {
  date: string;
  meta: string;
  repoHref: string;
  summary: string;
};

type SpielwieseIntroTextSection = {
  paragraphs: readonly string[];
  title: string;
};

type SpielwieseIntroTimelineSection = {
  detailsLabel: string;
  tldr: string;
  timelineEntries: readonly SpielwieseIntroTimelineEntry[];
  title: "Timeline";
};

export const spielwieseSetupMomentContent = {
  title: "Challenge: Redesign Langfuse in 7 days in code",
  updatedAt: "Updated Apr 13, 2026",
  sections: [
    {
      paragraphs: [
        "today's langfuse is built around features: traces, evaluations, monitoring. yet, the users don't think in features but in the problem they're trying to solve.",
        "also when a user enters the langfuse dashboard, the first thing they see is an empty data dashboard. i questioned that. why do users sign up for langfuse in the first place? what is their mental state?",
        "[ image of current langfuse dashboard ]",
        "the state i identified: they have an ai product with prompts already that they didn't instrument yet and want to do so now in order to improve them.",
        "now, the ultimate goal for langfuse is to get users who retain and engage with the platform longer term, and this is achieved with the habit moment. (the moment where the user built an habit around the app)",
        "[ image of setup, aha, habit moment ]",
        "in order to achieve that habit moment, they need to experience the aha moment (the moment where they see the first value of the product) and the setup moment (the moment that enables them to see the value in the first place).",
        "i focused on the setup moment. and the setup moment is the moment where they are fully enabled to experience the aha moment of the platfrom. set api keys and deployed their first instrumented prompt.",
        "the aha moment is the moment a user sees what is wrong with their prompt and what to change. langfuse currently tries to bring users there through monitoring as a first touchpoint. but monitoring alone, before any evaluation has run, doesn't get them there.",
        "so i focused on onboarding and the prompt creation and evaluation screens.",
      ],
      title: "Approach",
    },
    {
      paragraphs: ["[ video placeholder ]"],
      title: "Outcome",
    },
    {
      detailsLabel: "details",
      tldr: "tldr: intensest work stretch was sat apr 11 to mon apr 13, with 61k loc. that's where the prompt engineering flow, case-study onboarding, and onboarding all came together.",
      timelineEntries: [
        {
          date: "tue apr 7",
          meta: "16k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/main...03bac0d44c3a24e3ffc5fe0433b73c732e5bfc29",
          summary:
            "built product shell with mock auth & mock apis and routed preview for setting up the workspace workflow based and not feature based.",
        },
        {
          date: "wed apr 8",
          meta: "693 loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/03bac0d44c3a24e3ffc5fe0433b73c732e5bfc29...03666386c8dbc1c68bf3900a426fa02247a9043e",
          summary:
            "fixed a sidebar bug of the present langfuse dashboard that just annoyed me",
        },
        {
          date: "thu apr 9",
          meta: "4k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/03666386c8dbc1c68bf3900a426fa02247a9043e...c0d6a3b644a446bfb41858cd039bda2190bc461c",
          summary:
            "split the new shell from legacy so i had my own structure. built a local ui layer and locked it down with a scoped eslint block and a custom style-guard script: code shape: max-depth 3, max-lines-per-function 60, complexity at 10, no nested ternaries, no param reassign, prefer-const, eqeqeq. hook bans: no direct useEffect or useLayoutEffect. use useMountEffect for on-mount logic only. import isolation: no radix-ui, no main product nav, layouts, or feature imports. react/ts: banned @ts-ignore, @ts-nocheck, no unstable nested components, no array index keys. style guard: no raw tailwind palette classes, no space-x/y, no dark: overrides, no !important. wired into pnpm --filter web run lint, documented in AGENTS.md.",
        },
        {
          date: "fri apr 10",
          meta: "4k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/c0d6a3b644a446bfb41858cd039bda2190bc461c...1cb105e1207795414ff5de894f33f284b7bfdaca",
          summary:
            "added architecture-boundary linting on top. turned onboarding into a routed sequence. built dedicated design-system area with own config and primitives.",
        },
        {
          date: "sat apr 11",
          meta: "34k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/1cb105e1207795414ff5de894f33f284b7bfdaca...7da51b9bd30d88e8343ef4d847a54b92d2f4640b",
          summary:
            "further simplified editing, playground, and evaluation. built the model picker with model recommendation and benchmarks.",
        },
        {
          date: "sun apr 12",
          meta: "11k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/7da51b9bd30d88e8343ef4d847a54b92d2f4640b...bd54da1bd8a2679e1e771f4cf82596acb32dc9ed",
          summary:
            "built the onboarding concept layer and added more flesh to the evaluation feature.",
        },
        {
          date: "mon apr 13",
          meta: "15k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/bd54da1bd8a2679e1e771f4cf82596acb32dc9ed...900ac296111f718b51e6d5bb28e9a2dd35caa125",
          summary:
            "built the onboarding to dashboard handoff and really banged my head against a wall at least 20 times on the prompt box to dashboard animation. and pruned the branch, to keep the diff smaller.",
        },
        {
          date: "tue apr 14",
          meta: "1k loc",
          repoHref:
            "https://github.com/langfuse/langfuse/compare/900ac296111f718b51e6d5bb28e9a2dd35caa125...1067e2def3a67f415eadbbd1546d8d5ab5daab4c",
          summary:
            "locked to light theme, killed theme drift. polished shell, finder, picker, and onboarding transitions. backed the final state with regression tests.",
        },
      ],
      title: "Timeline",
    },
    {
      paragraphs: [
        "- Conductor [https://www.conductor.build/] with Codex [https://chatgpt.com/codex/]",
        "- WisprFlow [https://wisprflow.ai/]",
        "- Agentation [https://www.agentation.com/]",
        "- Mesurer [https://mesurer.ibelick.com/]",
        "- Shaders [https://shaders.com/]",
        "- ReMarkable [https://remarkable.com/]",
        "- Paper design [https://paper.design/]",
        "Skills:",
        "- ui.sh [https://ui.sh/]",
        "- Vercel React Best Practices [https://vercel.com/blog/introducing-react-best-practices]",
        "- emil.md [https://animations.dev/learn/emil-skill]",
        "- shadcn/ui [https://ui.shadcn.com/docs/skills]",
      ],
      title: "Colophon",
    },
  ],
  videoNote: "not finished yet :D",
  footer: "Time for you to experience it",
} as const satisfies {
  footer: string;
  sections: readonly (
    | SpielwieseIntroTextSection
    | SpielwieseIntroTimelineSection
  )[];
  title: string;
  updatedAt: string;
  videoNote: string;
};
