import type { OnboardingAnswerKey } from "./spielwieseOnboardingFlow";

export const onboardingStepCopy: Record<
  OnboardingAnswerKey,
  { body: string; eyebrow: string; title: string }
> = {
  intent: {
    eyebrow: "Room setup",
    title: "The room should meet your reason for showing up.",
    body: "A room for exploring should stay loose. A room for shaping a workflow should narrow faster. A review room should surface what matters without asking for extra setup.",
  },
  opening: {
    eyebrow: "First impression",
    title: "The first minute should signal what this space is optimized for.",
    body: "Some starts should feel calm and focused. Some should feel guided. Some should feel fast. This answer decides the tone before the details show up.",
  },
  role: {
    eyebrow: "Direction",
    title: "A better room starts by knowing how much direction to give you.",
    body: "If you already know what to build, the room can stay out of your way. If you do not, it should help shape the path before it asks for precision.",
  },
};
