import preview from "../../../../../../.storybook/preview";
import { StatusMessageSection } from "./StatusMessageSection";

const meta = preview.meta({
  component: StatusMessageSection,
});

export const Default = meta.story({
  args: {
    currentView: "pretty",
    status: {
      level: "DEFAULT",
      message: "The observation completed with additional status details.",
    },
  },
});

export const Debug = meta.story({
  args: {
    currentView: "pretty",
    status: {
      level: "DEBUG",
      message: "Detailed diagnostic information for this observation.",
    },
  },
});

export const Warning = meta.story({
  args: {
    currentView: "pretty",
    status: {
      level: "WARNING",
      message: "The observation completed with a recoverable warning.",
    },
  },
});

export const Error = meta.story({
  args: {
    currentView: "pretty",
    status: {
      level: "ERROR",
      message: "Upstream model request timed out after 30 seconds.",
    },
  },
});
