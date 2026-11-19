import { type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { type SessionCustomizationDialog } from "@/src/features/sessions/SessionCustomizationDialog/SessionCustomizationDialog";
import { ConnectedAnnotationQueueSessionViewSettings } from "./ConnectedAnnotationQueueSessionViewSettings";
import { AnnotationQueueSessionViewSettings } from "./AnnotationQueueSessionViewSettings/AnnotationQueueSessionViewSettings";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => true,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({}),
    sessionViews: {
      list: {
        useQuery: () => ({ data: [], isPending: false, isError: false }),
      },
      create: { useMutation: () => ({ reset: vi.fn() }) },
      update: { useMutation: () => ({ reset: vi.fn() }) },
    },
  },
}));
vi.mock(
  "@/src/features/sessions/SessionCustomizationDialog/SessionCustomizationDialog",
  () => ({
    SessionCustomizationDialog: ({
      variant,
    }: ComponentProps<typeof SessionCustomizationDialog>) => (
      <Dialog title="View editor">
        <Dialog.Body>
          <input
            aria-label="View name"
            defaultValue={
              variant.type === "customize" ? "" : variant.initialName
            }
          />
        </Dialog.Body>
      </Dialog>
    ),
  }),
);

it("keeps the queue dialog visible and preserves its draft when opening, dismissing, and reopening the view editor", async () => {
  render(
    <LayerProvider>
      <TooltipProvider>
        <DialogController
          renderDialog={() => (
            <ConnectedAnnotationQueueSessionViewSettings
              projectId="project"
              value={null}
              onChange={vi.fn()}
              disabled={false}
            >
              {(settings) => (
                <Dialog title="Queue settings">
                  <Dialog.Body>
                    <input aria-label="Queue name" defaultValue="" />
                    {settings && (
                      <AnnotationQueueSessionViewSettings
                        {...settings}
                        disabled={false}
                      />
                    )}
                  </Dialog.Body>
                </Dialog>
              )}
            </ConnectedAnnotationQueueSessionViewSettings>
          )}
        >
          {({ openDialog }) => <button onClick={openDialog}>Open queue</button>}
        </DialogController>
      </TooltipProvider>
    </LayerProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open queue" }));
  expect(screen.getByRole("dialog", { name: "Queue settings" })).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Queue name" }), {
    target: { value: "Queue draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Session view" }));
  fireEvent.click(screen.getByRole("button", { name: "Create view" }));
  expect(screen.getByRole("dialog", { name: "View editor" })).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "View name" }), {
    target: { value: "Unsaved view" },
  });
  fireEvent.keyDown(screen.getByRole("dialog", { name: "View editor" }), {
    key: "Escape",
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "View editor" })).toBeNull(),
  );
  expect(screen.getByRole("textbox", { name: "Queue name" })).toHaveValue(
    "Queue draft",
  );
  fireEvent.click(screen.getByRole("button", { name: "Create view" }));
  expect(screen.getByRole("textbox", { name: "View name" })).toHaveValue("");
});
