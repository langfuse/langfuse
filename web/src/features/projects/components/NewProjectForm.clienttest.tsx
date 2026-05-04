import type { Mock, MockInstance } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NewProjectForm } from "./NewProjectForm";

const mockUseSession = vi.fn();
const mockUseMutation = vi.fn();
const mockCapture = vi.fn();
const mockShowErrorToast = vi.fn();

let resolveUpdateSession: (() => void) | undefined;
let rejectUpdateSession: ((error: Error) => void) | undefined;
let mutateAsyncMock: Mock;
let consoleErrorSpy: MockInstance;

vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mockCapture,
}));

vi.mock("../../notifications/showErrorToast", () => ({
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
}));

vi.mock("../../../utils/api", () => ({
  api: {
    projects: {
      create: {
        useMutation: (...args: unknown[]) => mockUseMutation(...args),
      },
    },
  },
}));

describe("NewProjectForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mutateAsyncMock = vi.fn().mockResolvedValue({ id: "project-123" });
    resolveUpdateSession = undefined;
    rejectUpdateSession = undefined;

    mockUseMutation.mockImplementation((options?: { onError?: unknown }) => ({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      ...options,
    }));

    mockUseSession.mockReturnValue({
      update: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveUpdateSession = resolve;
          }),
      ),
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("waits for the session refresh before calling onSuccess", async () => {
    const onSuccess = vi.fn();

    render(<NewProjectForm orgId="org-123" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId("new-project-name-input"), {
      target: { value: "my-project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        name: "my-project",
        orgId: "org-123",
      }),
    );

    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveUpdateSession?.();
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("project-123"));
  });

  it("shows a warning when the session refresh fails after project creation", async () => {
    const onSuccess = vi.fn();

    mockUseSession.mockReturnValue({
      update: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            rejectUpdateSession = reject;
          }),
      ),
    });

    render(<NewProjectForm orgId="org-123" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId("new-project-name-input"), {
      target: { value: "my-project" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        name: "my-project",
        orgId: "org-123",
      }),
    );

    await act(async () => {
      rejectUpdateSession?.(new Error("session refresh failed"));
    });

    await waitFor(() =>
      expect(mockShowErrorToast).toHaveBeenCalledWith(
        "Project created",
        expect.stringContaining("reload the page"),
        "WARNING",
      ),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Create" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
