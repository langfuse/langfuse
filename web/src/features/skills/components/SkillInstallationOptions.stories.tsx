import { expect, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SkillInstallationOptions } from "./SkillInstallationOptions";

/** Highlighted commands are split across token spans, so match the whole code block. */
const codeBlockWithText =
  (text: string | RegExp) => (_content: string, element: Element | null) =>
    element?.tagName === "PRE" &&
    (typeof text === "string"
      ? element.textContent === text
      : text.test(element.textContent ?? ""));

const meta = preview.meta({ component: SkillInstallationOptions });

export const FromSkill = meta.story({
  args: {
    host: "https://cloud.langfuse.com",
    initialValues: {
      by: "all",
      name: "review-code",
      version: 7,
      label: "production",
      tag: "engineering",
    },
    names: ["review-code", "refund-policy"],
    labels: ["production", "staging"],
    tags: ["engineering", "research"],
  },
});

export const FromList = meta.story({
  args: {
    host: "https://cloud.langfuse.com",
    initialValues: {
      by: "all",
      name: "review-code",
      version: null,
      label: "production",
      tag: "customer-support",
    },
    names: ["review-code", "refund-policy"],
    labels: ["production"],
    tags: ["customer-support", "engineering"],
  },
});

export const NoTags = meta.story({
  args: {
    host: "https://cloud.langfuse.com",
    initialValues: {
      by: "tag",
      name: "review-code",
      version: null,
      label: "production",
      tag: "my-tag",
    },
    names: ["review-code", "refund-policy"],
    labels: [],
    tags: [],
  },
});

export const InstallScopes = meta.story({
  name: "(Test) Switch install scope",
  args: {
    host: "https://cloud.langfuse.com",
    initialValues: {
      by: "all",
      name: "review-code",
      version: 7,
      label: "production",
      tag: "engineering",
    },
    names: ["review-code", "refund-policy"],
    labels: ["production"],
    tags: ["engineering"],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        codeBlockWithText("langfuse skills install --all --label='production'"),
      ),
    ).toBeVisible();
    const configure = canvas.getByRole("button", {
      name: "Configure install command",
    });
    await expect(configure).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(configure);
    await expect(canvas.getByRole("tab", { name: "Version" })).toBeDisabled();

    await userEvent.click(canvas.getByRole("tab", { name: "Name" }));
    await expect(
      canvas.getByText(
        codeBlockWithText("langfuse skills install 'review-code' --version 7"),
      ),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Tag" }));
    await expect(
      canvas.getByText(
        codeBlockWithText(
          "langfuse skills install --tag='engineering' --label='production'",
        ),
      ),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "All" }));
    await userEvent.click(configure);
    await expect(
      canvas.getByText(
        codeBlockWithText("langfuse skills install --all --label='production'"),
      ),
    ).toBeVisible();
  },
});
