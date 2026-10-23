import preview from "@/.storybook/preview";
import { JobCard } from "./JobCard";

const meta = preview.meta({
  component: JobCard,
});

const job = {
  title: "Find why an answer broke",
  description: "Open this trace, see every step, and spot the one that failed.",
  drawing: "failedSpan",
  action: { text: "Open this trace", href: "#trace-1" },
} as const;

export const Default = meta.story({
  args: { ...job, isLocked: false, isUnlocking: false },
});

export const Locked = meta.story({
  args: { ...job, isLocked: true, isUnlocking: false },
});

export const Unlocking = meta.story({
  args: { ...job, isLocked: false, isUnlocking: true },
});
