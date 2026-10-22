import { expect, spyOn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { CliSkillImportInstructions } from "./CliSkillImportInstructions";

const meta = preview.meta({
  component: CliSkillImportInstructions,
  args: {
    projectId: "project",
    host: "https://cloud.langfuse.com",
  },
});

export const Default = meta.story({});

export const ImportScopes = meta.story({
  name: "(Test) Switch import scope and copy prompt",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const writeText = spyOn(
      navigator.clipboard,
      "writeText",
    ).mockResolvedValue();
    try {
      const recursiveCommand =
        "langfuse skills push '.agents/skills' --recursive";
      await expect(canvas.getByText(recursiveCommand)).toBeVisible();
      const configure = canvas.getByRole("button", {
        name: "Configure import command",
      });
      await expect(configure).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(configure);
      await userEvent.click(canvas.getByRole("tab", { name: "Single skill" }));
      await userEvent.clear(canvas.getByLabelText("Skill folder"));
      await userEvent.type(
        canvas.getByLabelText("Skill folder"),
        "team's skills/review-code",
      );
      const singleCommand = `langfuse skills push 'team'"'"'s skills/review-code'`;
      await expect(canvas.getByText(singleCommand)).toBeVisible();
      await userEvent.click(
        canvas.getByRole("button", { name: "Copy prompt" }),
      );
      await expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining(singleCommand),
      );
      await expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining(`Langfuse host: ${JSON.stringify(args.host)}`),
      );
      await userEvent.click(canvas.getByRole("tab", { name: "All skills" }));
      await expect(canvas.getByText(recursiveCommand)).toBeVisible();
      await userEvent.click(canvas.getByRole("tab", { name: "Single skill" }));
      await expect(canvas.getByLabelText("Skill folder")).toHaveValue(
        "team's skills/review-code",
      );
      await expect(canvas.getByText(singleCommand)).toBeVisible();
    } finally {
      writeText.mockRestore();
    }
  },
});

export const EmptyPath = meta.story({
  name: "(Test) Reject blank folder path",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Configure import command" }),
    );
    await userEvent.clear(canvas.getByLabelText("Skills directory"));
    await userEvent.type(canvas.getByLabelText("Skills directory"), "   ");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Enter a folder path",
    );
    await expect(
      canvas.queryByRole("button", { name: "Copy prompt" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText(/langfuse skills push/),
    ).not.toBeInTheDocument();
  },
});
