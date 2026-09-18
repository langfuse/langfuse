import { type ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import {
  PageHeaderActionsSlotTarget,
  PageHeaderControlsSlotProvider,
} from "@/src/components/layouts/page-header-controls-slot";
import { NEW_SKILL_INITIAL_VALUE, SkillEditor } from "./SkillEditor";
import { createSkillEditorStore } from "./skillEditorStore";

const { capture, downloadSkillVersion } = vi.hoisted(() => ({
  capture: vi.fn(),
  downloadSkillVersion: vi.fn(async () => ({ fileCount: 2 })),
}));

vi.mock("react-responsive", () => ({ useMediaQuery: () => true }));
vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: () => <div>Editor</div>,
}));
vi.mock("@/src/components/ui/resizable", () => ({
  ResizableHandle: () => <div />,
  ResizablePanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));
vi.mock("@/src/features/skills/actions/downloadSkillVersion", () => ({
  downloadSkillVersion,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    skills: {
      prepareUploads: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      createVersion: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      setLabels: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      setTags: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    useUtils: () => ({
      skills: {
        all: { invalidate: vi.fn(async () => undefined) },
        editorByName: { invalidate: vi.fn(async () => undefined) },
      },
    }),
  },
}));

describe("SkillEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadSkillVersion.mockResolvedValue({ fileCount: 2 });
  });

  it("downloads the selected existing version", async () => {
    const { container } = renderWithHeader(
      <SkillEditor
        projectId="project-id"
        store={createSkillEditorStore({
          name: "support-triage",
          baseVersion: 2,
          labels: ["production"],
          tags: ["support"],
          files: [
            {
              path: "SKILL.md",
              content: "# Support triage",
              contentType: "text/markdown",
              executable: false,
            },
          ],
        })}
        canCreate
        history={{
          kind: "versions",
          versions: [
            {
              version: 1,
              labels: [],
              commitMessage: null,
              createdAt: new Date("2026-09-17T08:30:00.000Z"),
            },
            {
              version: 2,
              labels: ["production"],
              commitMessage: "Publish support workflow",
              createdAt: new Date("2026-09-18T08:30:00.000Z"),
            },
          ],
          selectedVersion: 2,
          onSelect: vi.fn(async () => undefined),
        }}
        metadataOptions={{ labels: ["production"], tags: ["support"] }}
        onCreated={vi.fn(async () => undefined)}
      />,
    );

    const header = container.querySelector("header")!;
    expect(
      within(header).getByRole("button", { name: "New version" }),
    ).toBeEnabled();
    fireEvent.click(
      within(header).getByRole("button", { name: "Download version 2" }),
    );
    await waitFor(() =>
      expect(downloadSkillVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "project-id",
          name: "support-triage",
          version: 2,
        }),
      ),
    );
    expect(capture).toHaveBeenCalledWith("skills:version_download", {
      fileCount: 2,
    });
    expect(within(header).queryByText("Version unchanged")).toBeNull();
  });

  it("takes a new skill name from SKILL.md frontmatter", () => {
    const { container } = renderWithHeader(
      <SkillEditor
        projectId="project-id"
        store={createSkillEditorStore(NEW_SKILL_INITIAL_VALUE)}
        canCreate
        history={{ kind: "new" }}
        metadataOptions={{ labels: ["production"], tags: [] }}
        onCreated={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    const header = container.querySelector("header")!;
    expect(
      within(header).getByRole("button", { name: "Create skill" }),
    ).toBeEnabled();
    expect(
      within(header).queryByRole("button", { name: /Download version/ }),
    ).toBeNull();
    expect(within(header).queryByText("Version unchanged")).toBeNull();
  });
});

function renderWithHeader(children: ReactNode) {
  return render(
    <PageHeaderControlsSlotProvider>
      <header>
        <PageHeaderActionsSlotTarget />
      </header>
      {children}
    </PageHeaderControlsSlotProvider>,
  );
}
