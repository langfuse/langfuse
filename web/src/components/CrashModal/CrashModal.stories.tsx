import preview from "../../../.storybook/preview";
import { CrashModal } from "./CrashModal";

const SENTRY_EVENT_ID = "2f7f0f0d4b4b4d17bdeed6d3d59b8b92";

const meta = preview.meta({
  component: CrashModal,
  args: {
    description:
      "Application error: a client-side exception has occurred while loading cloud.langfuse.com (see the browser console for more information).",
    showReturnHome: true,
  },
});

export const ClientCrash = meta.story({
  args: {
    sentryEventId: SENTRY_EVENT_ID,
  },
});

export const HttpError = meta.story({
  args: {
    description: "Internal Server Error.",
    statusCode: 500,
  },
});

export const WithoutErrorId = meta.story({});

export const WithoutCTA = meta.story({
  args: {
    showReturnHome: false,
  },
});
