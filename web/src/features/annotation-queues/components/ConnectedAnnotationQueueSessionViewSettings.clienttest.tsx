import { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ConnectedAnnotationQueueSessionViewSettings } from "./ConnectedAnnotationQueueSessionViewSettings";

const mocks = vi.hoisted(() => ({
  isV4: true,
  timelineEnabled: true,
  query: vi.fn(),
  dialog: vi.fn(),
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: mocks.isV4 }),
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => mocks.timelineEnabled,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/utils/api", () => ({
  api: { sessionViews: { list: { useQuery: mocks.query } } },
}));
vi.mock("./ConnectedAnnotationQueueSessionViewDialogController", () => ({
  ConnectedAnnotationQueueSessionViewDialogController: ({
    children,
  }: {
    children: (controls: { openDialog: () => void }) => ReactNode;
  }) => {
    mocks.dialog();
    return children({ openDialog: vi.fn() });
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isV4 = true;
  mocks.timelineEnabled = true;
  mocks.query.mockReturnValue({ data: [], isPending: false, isError: false });
});

it.each([
  { isV4: false, timelineEnabled: true },
  { isV4: true, timelineEnabled: false },
  { isV4: false, timelineEnabled: false },
])(
  "hides settings and disables fetching for unsupported paths: %o",
  (flags) => {
    Object.assign(mocks, flags);
    renderSettings();
    expect(screen.getByText("Settings unavailable")).toBeVisible();
    expect(mocks.query).toHaveBeenCalledWith(
      { projectId: "project" },
      { enabled: false },
    );
    expect(mocks.dialog).not.toHaveBeenCalled();
  },
);

it("supplies settings and mounts the editor only for the timeline read path", () => {
  renderSettings();
  expect(screen.getByText("Settings available")).toBeVisible();
  expect(mocks.query).toHaveBeenCalledWith(
    { projectId: "project" },
    { enabled: true },
  );
  expect(mocks.dialog).toHaveBeenCalled();
});

function renderSettings() {
  return render(
    <ConnectedAnnotationQueueSessionViewSettings
      projectId="project"
      value={null}
      onChange={vi.fn()}
      disabled={false}
    >
      {(settings) => (
        <span>{settings ? "Settings available" : "Settings unavailable"}</span>
      )}
    </ConnectedAnnotationQueueSessionViewSettings>,
  );
}
