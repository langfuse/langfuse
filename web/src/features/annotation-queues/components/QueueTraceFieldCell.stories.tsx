import preview from "../../../../.storybook/preview";
import { QueueTraceFieldCell } from "./QueueTraceFieldCell";

const meta = preview.meta({
  component: QueueTraceFieldCell,
});

export const Text = meta.story({
  args: { value: "Berlin office", format: "text" },
});

export const PhoneNorthAmerica = meta.story({
  args: { value: "+12025550123", format: "phone" },
});

export const PhoneInternational = meta.story({
  args: { value: "+442079460123", format: "phone" },
});

export const Link = meta.story({
  args: { value: "https://example.com/reports/1.pdf", format: "link" },
});

export const DateTime = meta.story({
  args: { value: "2026-10-21T22:19:00.000Z", format: "datetime" },
});

export const NumberValue = meta.story({
  args: { value: "1234567.5", format: "number" },
});

export const Duration = meta.story({
  args: { value: "135", format: "duration" },
});

export const BadgeValue = meta.story({
  args: { value: "support", format: "badge" },
});

export const NotMatchingTheFormat = meta.story({
  args: { value: "javascript:alert(1)", format: "link" },
});
