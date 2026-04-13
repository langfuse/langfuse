export const spielwieseSetupMomentContent = {
  title: "Langfuse redesign",
  updatedAt: "Updated Apr 13, 2026",
  sections: [
    {
      paragraphs: [
        "today's langfuse is built around features: traces, evaluations, monitoring. yet, the users don't think in features but in the problem they're trying to solve.",
        "when a user enters the langfuse dashboard, the first thing they see is an empty data dashboard. i questioned that. why do users sign up for langfuse in the first place? what is their mental state?",
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
} as const;
