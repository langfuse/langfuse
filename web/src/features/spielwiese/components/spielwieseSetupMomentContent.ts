export const spielwieseSetupMomentContent = {
  eyebrow: "Unsolicited concept for Langfuse",
  title: "Designing the setup moment for people who are not technical yet.",
  intro: [
    "I wanted to respond to your push toward a better experience for less technical users by focusing on one moment: the setup moment.",
    "The point is not to explain everything up front. The point is to help someone cross the threshold with enough confidence to reach their own aha moments afterwards.",
  ],
  thesis:
    "This concept only designs the setup moment directly. Aha is treated as a cluster of validating moments that setup makes possible. Habit is intentionally out of scope.",
  moments: [
    {
      id: "setup",
      kicker: "Setup moment",
      title: "Orientation before confidence.",
      body: "The product should reduce fear, ask the right questions, and make the first structure feel authored with the user instead of dropped on top of them.",
      emphasis: "primary" as const,
    },
    {
      id: "aha",
      kicker: "Aha moments",
      title: "A set of signals, not one miracle.",
      body: "The user starts to notice that the system is shaping itself around their intent. That recognition can happen in multiple small waves.",
      emphasis: "secondary" as const,
    },
    {
      id: "habit",
      kicker: "Habit moment",
      title: "What comes after trust.",
      body: "Habit depends on repetition and proof over time. I am not designing that layer here, only the bridge that could enable it.",
      emphasis: "secondary" as const,
    },
  ],
  artifactSlots: [
    {
      id: "drawing-01",
      label: "Drawing slot 01",
      note: "Drop in a sketch, note, or storyboard fragment.",
    },
    {
      id: "drawing-02",
      label: "Drawing slot 02",
      note: "Use this for a system diagram or handwritten framing.",
    },
    {
      id: "drawing-03",
      label: "Drawing slot 03",
      note: "Use this for a lo-fi flow or an annotated screen.",
    },
  ],
  video: {
    title: "Walkthrough video",
    body: "A short recording should live here, where you explain the setup / aha / habit framing and then walk through the simulated product flow.",
  },
  closing:
    "After this point the experience should stop teaching and start behaving like product.",
} as const;
