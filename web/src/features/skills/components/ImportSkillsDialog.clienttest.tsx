import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportSkillsDialog } from "./ImportSkillsDialog";

const { discoverLocalSkills, byName, createVersion, copyTextToClipboard } =
  vi.hoisted(() => ({
    discoverLocalSkills: vi.fn(),
    byName: vi.fn(),
    createVersion: vi.fn(),
    copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("../utils/local-import", () => ({ discoverLocalSkills }));
vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));
vi.mock("@/src/features/public-api/hooks/useLangfuseEnvCode", () => ({
  useLangfuseBaseUrl: () => "https://cloud.langfuse.com",
}));
vi.mock("@/src/features/notifications", () => ({ showSuccessToast: vi.fn() }));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  getTrpcErrorCode: vi.fn(),
  api: {
    useUtils: () => ({
      skills: { invalidate: vi.fn() },
      client: { skills: { byName: { query: byName } } },
    }),
    skills: {
      createVersion: {
        useMutation: () => ({ mutateAsync: createVersion, reset: vi.fn() }),
      },
    },
  },
}));

const firstSkill = {
  name: "review-code",
  path: "review-code",
  description: "Review a change",
  files: [{ path: "SKILL.md", content: "Review instructions" }],
  error: null,
};
const secondSkill = {
  name: "write-tests",
  path: "write-tests",
  description: "Write regression tests",
  files: [{ path: "SKILL.md", content: "Testing instructions" }],
  error: null,
};

afterEach(cleanup);

describe("ImportSkillsDialog", () => {
  it("copies the configured CLI command and preserves paths when switching import scope", async () => {
    render(
      <ImportSkillsDialog projectId="project">
        {(openDialog) => <button onClick={openDialog}>Open import</button>}
      </ImportSkillsDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open import" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "CLI" }), {
      button: 0,
      ctrlKey: false,
    });
    const recursiveCommand =
      "langfuse skills push '.agents/skills' --recursive";
    expect(screen.getByText(recursiveCommand)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Configure import command" }),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Single skill" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.change(screen.getByLabelText("Skill folder"), {
      target: { value: "team's skills/review-code" },
    });
    const singleCommand = `langfuse skills push 'team'"'"'s skills/review-code'`;
    expect(screen.getByText(singleCommand)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenLastCalledWith(
        expect.stringContaining(singleCommand),
      );
    });
    expect(copyTextToClipboard).toHaveBeenLastCalledWith(
      expect.stringContaining('Langfuse host: "https://cloud.langfuse.com"'),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All skills" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText(recursiveCommand)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Single skill" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByLabelText("Skill folder")).toHaveValue(
      "team's skills/review-code",
    );
    expect(screen.getByText(singleCommand)).toBeInTheDocument();
  });

  it("does not offer a CLI command or prompt for a blank folder path", () => {
    render(
      <ImportSkillsDialog projectId="project">
        {(openDialog) => <button onClick={openDialog}>Open import</button>}
      </ImportSkillsDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open import" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "CLI" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Configure import command" }),
    );
    fireEvent.change(screen.getByLabelText("Skills directory"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a folder path");
    expect(
      screen.queryByRole("button", { name: "Copy prompt" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/langfuse skills push/)).not.toBeInTheDocument();
  });

  it("retries a failed import without creating another version of successful skills", async () => {
    createVersion
      .mockResolvedValueOnce({ version: 3 })
      .mockRejectedValueOnce(new Error("Storage temporarily unavailable"))
      .mockResolvedValueOnce({ version: 2 });
    discoverLocalSkills.mockResolvedValue([firstSkill, secondSkill]);
    byName.mockImplementation(async ({ name }) => ({ name, files: [] }));
    render(
      <ImportSkillsDialog projectId="project">
        {(openDialog) => <button onClick={openDialog}>Open import</button>}
      </ImportSkillsDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open import" }));
    fireEvent.change(
      screen.getByRole("dialog").querySelector('input[type="file"]')!,
      { target: { files: [new File(["Instructions"], "SKILL.md")] } },
    );
    await screen.findByRole("checkbox", { name: /review-code/ });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 skills" }));

    await screen.findByText("Storage temporarily unavailable");
    expect(
      screen.getByRole("checkbox", { name: /review-code/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /review-code/ }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 1 skill" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(createVersion.mock.calls.map(([input]) => input.files)).toEqual([
      firstSkill.files,
      secondSkill.files,
      secondSkill.files,
    ]);
  });
});
