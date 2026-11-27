import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import preview from "../../../../.storybook/preview";
import { NewsletterOptIn } from "./NewsletterOptIn";

const meta = preview.meta({
  component: NewsletterOptIn,
  parameters: { layout: "fullscreen" },
});

const INSTALLER_DESCRIPTION =
  "Monthly product updates, plus a heads-up when a new major version or a required upgrade affects your instance.";
const INVITED_DESCRIPTION =
  "One email a month with the newest Langfuse features and improvements.";

const formArgs = (lists: ("product" | "oss")[], defaultEmail: string) => ({
  state: "form" as const,
  lists,
  defaultEmail,
  onSubscribe: fn(async () => undefined),
  onSkip: fn(async () => undefined),
});

export const InstallerForm = meta.story({
  args: formArgs(["product", "oss"], "jane@example.com"),
});

export const InvitedForm = meta.story({
  args: formArgs(["product"], "alex@example.com"),
});

export const LoadingAndConnectionCheck = meta.story({
  args: {
    state: "loading",
  },
});

export const InstallerUnreachable = meta.story({
  args: {
    state: "unreachable",
    lists: ["product", "oss"],
    isContinuing: false,
    onContinue: fn(),
  },
});

export const InvitedUnreachable = meta.story({
  args: {
    state: "unreachable",
    lists: ["product"],
    isContinuing: false,
    onContinue: fn(),
  },
});

export const InstallerFailed = meta.story({
  args: {
    state: "failed",
    lists: ["product", "oss"],
    isContinuing: false,
    onContinue: fn(),
  },
});

export const InvitedFailed = meta.story({
  args: {
    state: "failed",
    lists: ["product"],
    isContinuing: false,
    onContinue: fn(),
  },
});

export const FailedWhileContinuing = meta.story({
  args: {
    state: "failed",
    lists: ["product", "oss"],
    isContinuing: true,
    onContinue: fn(),
  },
});

export const Completing = meta.story({
  args: {
    state: "completing",
  },
});

export const ShowsTheInstallerCopy = meta.story({
  name: "(Test) Shows The Installer Copy",
  args: formArgs(["product", "oss"], "jane@example.com"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(INSTALLER_DESCRIPTION)).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Email" })).toHaveValue(
      "jane@example.com",
    );
    const skip = canvas.getByRole("button", { name: "Skip" });
    const subscribe = canvas.getByRole("button", { name: "Subscribe" });
    await expect(subscribe.nextElementSibling).toBe(skip);
    await expect(canvas.queryByRole("switch")).not.toBeInTheDocument();
  },
});

export const ShowsTheInvitedCopy = meta.story({
  name: "(Test) Shows The Invited Copy",
  args: formArgs(["product"], "alex@example.com"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(INVITED_DESCRIPTION)).toBeInTheDocument();
    await expect(
      canvas.queryByText(INSTALLER_DESCRIPTION),
    ).not.toBeInTheDocument();
  },
});

const skipArgs = formArgs(["product", "oss"], "jane@example.com");

export const SkipsWithoutSubscribing = meta.story({
  name: "(Test) Skips Without Subscribing",
  args: skipArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));

    await expect(skipArgs.onSkip).toHaveBeenCalledTimes(1);
    await expect(skipArgs.onSubscribe).not.toHaveBeenCalled();
  },
});

const subscribeArgs = formArgs(["product", "oss"], "jane@example.com");

export const SubscribesWithThePrefilledAddress = meta.story({
  name: "(Test) Subscribes With The Prefilled Address",
  args: subscribeArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Subscribe" }));

    await expect(subscribeArgs.onSubscribe).toHaveBeenCalledWith(
      { email: "jane@example.com" },
      expect.anything(),
    );
    await expect(subscribeArgs.onSkip).not.toHaveBeenCalled();
  },
});

const editedArgs = formArgs(["product"], "alex@example.com");

export const SubscribesAnEditedAddressOnEnter = meta.story({
  name: "(Test) Subscribes An Edited Address On Enter",
  args: editedArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByRole("textbox", { name: "Email" });

    await userEvent.clear(email);
    await userEvent.type(email, "  personal@example.com {Enter}");

    await expect(editedArgs.onSubscribe).toHaveBeenCalledWith(
      { email: "personal@example.com" },
      expect.anything(),
    );
  },
});

const invalidArgs = formArgs(["product", "oss"], "jane@example.com");

export const RejectsAnEmptyOrInvalidAddress = meta.story({
  name: "(Test) Rejects An Empty Or Invalid Address",
  args: invalidArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByRole("textbox", { name: "Email" });
    const subscribe = canvas.getByRole("button", { name: "Subscribe" });

    await userEvent.clear(email);
    await userEvent.click(subscribe);
    await expect(
      await canvas.findByText("Enter a valid email address"),
    ).toBeInTheDocument();

    await userEvent.type(email, "not-an-email");
    await userEvent.click(subscribe);
    await expect(
      canvas.getByText("Enter a valid email address"),
    ).toBeInTheDocument();
    await expect(invalidArgs.onSubscribe).not.toHaveBeenCalled();
  },
});

const skipInvalidArgs = formArgs(["product", "oss"], "jane@example.com");

export const SkipsWithAnInvalidAddress = meta.story({
  name: "(Test) Skips With An Invalid Address",
  args: skipInvalidArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const email = canvas.getByRole("textbox", { name: "Email" });

    await userEvent.clear(email);
    await userEvent.type(email, "not-an-email");
    await userEvent.click(canvas.getByRole("button", { name: "Skip" }));

    await expect(skipInvalidArgs.onSkip).toHaveBeenCalledTimes(1);
    await expect(
      canvas.queryByText("Enter a valid email address"),
    ).not.toBeInTheDocument();
  },
});

const pendingSubscribeArgs = {
  ...formArgs(["product", "oss"], "jane@example.com"),
  onSubscribe: fn(() => new Promise<void>(() => undefined)),
};

export const DisablesSkipWhileSubscribing = meta.story({
  name: "(Test) Disables Skip While Subscribing",
  args: pendingSubscribeArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const subscribe = canvas.getByRole("button", { name: "Subscribe" });
    const skip = canvas.getByRole("button", { name: "Skip" });
    const widthBefore = subscribe.getBoundingClientRect().width;
    const skipLeftBefore = skip.getBoundingClientRect().left;

    await userEvent.click(subscribe);

    await waitFor(() => expect(subscribe).toHaveAttribute("aria-busy", "true"));
    await expect(skip).toBeDisabled();
    await expect(subscribe.getBoundingClientRect().width).toBe(widthBefore);
    await expect(skip.getBoundingClientRect().left).toBe(skipLeftBefore);
  },
});

export const InvitedFallbackLinks = meta.story({
  name: "(Test) Invited Fallback Links",
  args: {
    state: "unreachable",
    lists: ["product"],
    isContinuing: false,
    onContinue: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText(INVITED_DESCRIPTION)).toBeInTheDocument();
    await expect(
      canvas.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["https://langfuse.com/changelog"]);
  },
});

export const InstallerFallbackKeepsTheHeader = meta.story({
  name: "(Test) Installer Fallback Keeps The Header",
  args: {
    state: "unreachable",
    lists: ["product", "oss"],
    isContinuing: false,
    onContinue: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const links = canvas.getAllByRole("link");
    const inCardOrder = [
      canvas.getByRole("heading", { name: "Stay up to date" }),
      canvas.getByText(INSTALLER_DESCRIPTION),
      canvas.getByText(
        "This browser can't reach langfuse.com. To subscribe, open a link below on a device with internet access:",
      ),
      ...links,
      canvas.getByRole("button", { name: "Continue" }),
    ];

    const documentOrder = Array.from(
      canvasElement.querySelectorAll<HTMLElement>("*"),
    ).filter((element) => inCardOrder.includes(element));
    await expect(documentOrder).toEqual(inCardOrder);
    await expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://langfuse.com/self-hosting/oss-newsletter",
      "https://langfuse.com/changelog",
    ]);
    await expect(canvas.getByText("Self-hosting notices:")).toBeInTheDocument();
    await expect(canvas.getByText("Product updates:")).toBeInTheDocument();
    for (const link of links) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  },
});

export const FocusesTheFailureReason = meta.story({
  name: "(Test) Focuses The Failure Reason",
  args: {
    state: "failed",
    lists: ["product"],
    isContinuing: false,
    onContinue: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByText(
        "We couldn't subscribe you. You can sign up here instead:",
      ),
    ).toHaveFocus();
  },
});

const INSTALLER_EXPLAINER_INTRO =
  "By subscribing, you'll be added to the Langfuse mailing lists for product updates and self-hosting notices.";
const INVITED_EXPLAINER_INTRO =
  "By subscribing, you'll be added to the Langfuse product updates list. Expect one email a month about new features.";

/** A bare click, as a tap delivers it: no hover and no keyboard focus that could open the card instead. */
const openExplainer = async (canvasElement: HTMLElement) => {
  fireEvent.click(
    within(canvasElement).getByRole("button", {
      name: "How your address is used",
    }),
  );
  return within(canvasElement.ownerDocument.body).findByRole(
    "dialog",
    { name: "How your address is used" },
    { timeout: 300 },
  );
};

export const OpensTheInstallerExplainerOnClick = meta.story({
  name: "(Test) Opens The Installer Explainer On Click",
  args: formArgs(["product", "oss"], "jane@example.com"),
  play: async ({ canvasElement }) => {
    const explainer = await openExplainer(canvasElement);

    await expect(explainer).toHaveTextContent(INSTALLER_EXPLAINER_INTRO);
    await expect(explainer).toHaveTextContent(
      "You can unsubscribe at any time with the link in every email.",
    );
    await expect(explainer).toHaveTextContent(
      "https://langfuse.com/api/productUpdateSignup",
    );
    await expect(explainer).toHaveTextContent(
      "LANGFUSE_DISABLE_SIGNUP_ONBOARDING=true",
    );
  },
});

export const OpensTheInvitedExplainerOnClick = meta.story({
  name: "(Test) Opens The Invited Explainer On Click",
  args: formArgs(["product"], "alex@example.com"),
  play: async ({ canvasElement }) => {
    const explainer = await openExplainer(canvasElement);

    await expect(explainer).toHaveTextContent(INVITED_EXPLAINER_INTRO);
    await expect(explainer).not.toHaveTextContent(INSTALLER_EXPLAINER_INTRO);
  },
});

export const ClosesTheExplainerOnEscape = meta.story({
  name: "(Test) Closes The Explainer On Escape",
  args: formArgs(["product", "oss"], "jane@example.com"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", {
      name: "How your address is used",
    });

    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await body.findByRole("dialog", { name: "How your address is used" });

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(trigger).toHaveFocus();
  },
});
