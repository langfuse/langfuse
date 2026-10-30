import { type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { defaultMonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";
import { NewMonitorAutomationDialog } from "./NewMonitorAutomationDialog";
import { WebhookSecretDialog } from "./WebhookSecretDialog";

const channels = ["alerts", "ml-ops", "on-call", "llm-quality"].map((name) => ({
  id: `C-${name}`,
  name,
}));

const onSurroundingFormSubmit = fn();

const baseArgs: ComponentProps<typeof NewMonitorAutomationDialog> = {
  actionTypes: ["SLACK", "WEBHOOK", "GITHUB_DISPATCH", "PAGERDUTY"],
  slack: {
    status: "connected",
    channelSelector: {
      channelsData: { channels, hasPrivateChannelAccess: true },
      isLoading: false,
      hasError: false,
      isRefreshing: false,
      onRefresh: fn(),
    },
    isTesting: false,
    onTestChannel: fn(async () => ({
      status: "sent" as const,
      channel: { id: "C-alerts", name: "alerts" },
    })),
  },
  pagerDuty: {
    canSend: true,
    isTestAlertOpen: false,
    isSending: false,
    sendError: undefined,
    onSend: fn(async () => {}),
    onResetSend: fn(),
    isResolving: false,
    onResolve: fn(),
  },
  isSubmitting: false,
  onSubmit: fn(async () => ({})),
};

const meta = preview.meta({
  component: NewMonitorAutomationDialog,
  parameters: { layout: "fullscreen" },
  args: baseArgs,
  render: (args) => <OpenDialog {...args} />,
});

export const Picker = meta.story({});

export const LockedSlack = meta.story({ args: { actionTypes: ["SLACK"] } });

export const LockedWebhook = meta.story({
  args: { actionTypes: ["WEBHOOK"] },
});

export const LockedGitHubDispatch = meta.story({
  args: { actionTypes: ["GITHUB_DISPATCH"] },
});

export const LockedPagerDuty = meta.story({
  args: { actionTypes: ["PAGERDUTY"] },
});

export const SlackNotConnected = meta.story({
  args: {
    slack: {
      status: "disconnected",
      canManageIntegration: true,
      canConnect: true,
      isConnecting: false,
      onConnect: fn(),
    },
  },
});

export const SlackCannotConnect = meta.story({
  args: {
    slack: {
      status: "disconnected",
      canManageIntegration: false,
      canConnect: false,
      isConnecting: false,
      onConnect: fn(),
    },
  },
});

export const SlackChannelsFailedToLoad = meta.story({
  args: {
    slack: {
      status: "connected",
      channelSelector: {
        channelsData: null,
        isLoading: false,
        hasError: true,
        isRefreshing: false,
        onRefresh: fn(),
        onReauthenticate: fn(),
      },
      isTesting: false,
      onTestChannel: fn(async () => ({
        status: "sent" as const,
        channel: { id: "C-alerts", name: "alerts" },
      })),
    },
  },
});

export const SlackChannelSelected = meta.story({
  args: {
    defaultValues: {
      ...defaultMonitorAutomationFormValues("SLACK", "Staging alerts"),
      slack: { channelId: "C-alerts", channelName: "alerts" },
    },
  },
});

export const ErrorsShown = meta.story({
  name: "(Test) Errors shown",
  args: {
    onSubmit: fn(async () => ({})),
    actionTypes: ["WEBHOOK"],
    defaultValues: {
      ...defaultMonitorAutomationFormValues("WEBHOOK", "Staging alerts"),
      webhook: {
        url: "not a url",
        headers: [
          { name: "content-type", value: "text/plain", isSecret: false },
        ],
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByDisplayValue("not a url");
    await userEvent.click(
      body.getByRole("button", { name: "Create automation" }),
    );
    await waitFor(() =>
      expect(body.getByText("Enter a valid HTTPS URL.")).toBeVisible(),
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});

export const TestInvalidDispatchUrlShowsError = meta.story({
  name: "(Test) Invalid dispatch URL shows the form error",
  args: {
    onSubmit: fn(async () => ({})),
    actionTypes: ["GITHUB_DISPATCH"],
    defaultValues: {
      ...defaultMonitorAutomationFormValues("GITHUB_DISPATCH", "Deploy"),
      githubDispatch: {
        url: "not a url",
        eventType: "langfuse-alert",
        githubToken: "ghp_token",
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByDisplayValue("not a url");
    await userEvent.click(
      body.getByRole("button", { name: "Create automation" }),
    );
    await waitFor(() =>
      expect(
        body.getByText("Enter a valid repository dispatch URL."),
      ).toBeVisible(),
    );
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
});

export const TestServerErrorShownInline = meta.story({
  name: "(Test) Server error shown inline",
  args: {
    actionTypes: ["GITHUB_DISPATCH"],
    defaultValues: {
      ...defaultMonitorAutomationFormValues("GITHUB_DISPATCH", "Deploy"),
      githubDispatch: {
        url: "kjhkjhkj.com",
        eventType: "langfuse-alert",
        githubToken: "ghp_token",
      },
    },
    onSubmit: fn(async () => ({
      error: "Invalid webhook URL: DNS lookup failed for kjhkjhkj.com",
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByDisplayValue("kjhkjhkj.com");
    await userEvent.click(
      body.getByRole("button", { name: "Create automation" }),
    );
    await waitFor(() =>
      expect(
        body.getByText(
          "Invalid webhook URL: DNS lookup failed for kjhkjhkj.com",
        ),
      ).toBeVisible(),
    );
    await expect(
      body.getByLabelText("Repository dispatch URL"),
    ).toHaveAttribute("aria-invalid", "true");
  },
});

export const TestWebhookSubmitsHttpsUrl = meta.story({
  name: "(Test) Webhook submits the https URL",
  args: {
    onSubmit: fn(async () => ({})),
    actionTypes: ["WEBHOOK"],
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const create = body.getByRole("button", { name: "Create automation" });
    await userEvent.type(body.getByLabelText("Name"), "Staging alerts");
    await expect(create).toBeDisabled();

    await userEvent.type(
      body.getByLabelText("Webhook URL"),
      "https://example.com/hook",
    );
    await userEvent.click(create);

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        webhook: { url: "example.com/hook", headers: [] },
      }),
    );
  },
});

export const TestDoesNotSubmitSurroundingForm = meta.story({
  name: "(Test) Does not submit the surrounding form",
  args: {
    onSubmit: fn(async () => ({})),
    actionTypes: ["WEBHOOK"],
    defaultValues: {
      ...defaultMonitorAutomationFormValues("WEBHOOK", "Staging alerts"),
      webhook: { url: "example.com/hook", headers: [] },
    },
  },
  render: (args) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSurroundingFormSubmit();
      }}
    >
      <OpenDialog {...args} />
    </form>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      body.getByRole("button", { name: "Create automation" }),
    );
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalled());
    await expect(onSurroundingFormSubmit).not.toHaveBeenCalled();
  },
});

export const WebhookSecret = meta.story({
  render: () => (
    <DialogController
      initialState={() => ({})}
      renderDialog={() => (
        <WebhookSecretDialog
          automationName="Staging alerts"
          webhookSecret="lf-whsec_3f9a1c0d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b"
        />
      )}
    >
      {() => null}
    </DialogController>
  ),
});

/** OpenDialog renders the dialog already open, as its controller would. */
function OpenDialog(props: ComponentProps<typeof NewMonitorAutomationDialog>) {
  return (
    <DialogController
      initialState={() => ({})}
      renderDialog={() => <NewMonitorAutomationDialog {...props} />}
    >
      {() => null}
    </DialogController>
  );
}
