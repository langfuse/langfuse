import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { ResetPasswordPage } from "./ResetPasswordPage";

const mocks = vi.hoisted(() => ({
  captureMock: vi.fn(),
  resetPasswordMock: vi.fn(),
  routerMock: {
    push: vi.fn(),
    query: {} as Record<string, unknown>,
  },
  sessionMock: {
    status: "authenticated",
    data: {
      user: {
        email: "jane@example.com",
        emailVerified: new Date().toISOString(),
        hasPassword: false,
      },
    },
  },
  langfuseCloudRegionMock: {
    isLangfuseCloud: true,
    region: "EU",
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.routerMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.sessionMock,
  signIn: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.captureMock,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => mocks.langfuseCloudRegionMock,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    credentials: {
      resetPassword: {
        useMutation: () => ({
          mutateAsync: mocks.resetPasswordMock,
          isPending: false,
        }),
      },
    },
  },
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routerMock.query = {};
    mocks.resetPasswordMock.mockResolvedValue(undefined);
    mocks.sessionMock.status = "authenticated";
    mocks.sessionMock.data = {
      user: {
        email: "jane@example.com",
        emailVerified: new Date().toISOString(),
        hasPassword: false,
      },
    };
    mocks.langfuseCloudRegionMock.isLangfuseCloud = true;
    mocks.langfuseCloudRegionMock.region = "EU";
  });

  const submitPasswordForm = async () => {
    render(<ResetPasswordPage passwordResetAvailable />);

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Password1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "Password1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(mocks.resetPasswordMock).toHaveBeenCalledWith({
        password: "Password1!",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_100));
    });
  };

  it("preserves demo targetPath in setup-password mode", async () => {
    mocks.routerMock.query = { targetPath: "/demo" };

    await submitPasswordForm();

    expect(mocks.routerMock.push).toHaveBeenCalledWith("/demo");
  });

  it("ignores non-demo targetPath in setup-password mode", async () => {
    mocks.routerMock.query = { targetPath: "/project/project-2" };

    await submitPasswordForm();

    expect(mocks.routerMock.push).toHaveBeenCalledWith("/onboarding");
  });
});
