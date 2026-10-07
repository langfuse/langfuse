import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportSkillsDialog } from "./ImportSkillsDialog";

const { discoverLocalSkills, byName, createVersion } = vi.hoisted(() => ({
  discoverLocalSkills: vi.fn(),
  byName: vi.fn(),
  createVersion: vi.fn(),
}));

vi.mock("../utils/local-import", () => ({ discoverLocalSkills }));
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
