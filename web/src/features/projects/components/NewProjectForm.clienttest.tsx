import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NewProjectForm } from "./NewProjectForm";

const mockUseSession = jest.fn();
const mockUseMutation = jest.fn();
const mockCapture = jest.fn();

let resolveUpdateSession: (() => void) | undefined;
let mutateAsyncMock: jest.Mock;

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("../../posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mockCapture,
}));

jest.mock("../../../utils/api", () => ({
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
    jest.clearAllMocks();

    mutateAsyncMock = jest.fn().mockResolvedValue({ id: "project-123" });
    resolveUpdateSession = undefined;

    mockUseMutation.mockImplementation((options?: { onError?: unknown }) => ({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      ...options,
    }));

    mockUseSession.mockReturnValue({
      update: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveUpdateSession = resolve;
          }),
      ),
    });
  });

  it("waits for the session refresh before calling onSuccess", async () => {
    const onSuccess = jest.fn();

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
});
