import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { OnboardingSurvey } from "./OnboardingSurvey";

const mocks = vi.hoisted(() => {
  return {
    completeMutateAsyncMock: vi.fn(),
    routerMock: {
      replace: vi.fn(),
    },
    statusSetDataMock: vi.fn(),
    statusUseQueryMock: vi.fn(),
    updateSessionMock: vi.fn(),
  };
});

vi.mock("next/router", () => ({
  useRouter: () => mocks.routerMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    update: mocks.updateSessionMock,
  }),
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: () => undefined,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      onboarding: {
        status: {
          setData: mocks.statusSetDataMock,
        },
      },
    }),
    onboarding: {
      status: {
        useQuery: mocks.statusUseQueryMock,
      },
      complete: {
        useMutation: () => ({
          mutateAsync: mocks.completeMutateAsyncMock,
        }),
      },
    },
  },
}));

describe("OnboardingSurvey", () => {
  let onboardingStatus:
    | { completed: false }
    | { completed: true; redirectTo: string };

  beforeEach(() => {
    vi.clearAllMocks();

    onboardingStatus = { completed: false };
    mocks.statusUseQueryMock.mockImplementation(() => ({
      data: onboardingStatus,
      isError: false,
      isLoading: false,
    }));
    mocks.statusSetDataMock.mockImplementation((_, value) => {
      onboardingStatus =
        typeof value === "function" ? value(onboardingStatus) : value;
    });
    mocks.completeMutateAsyncMock.mockResolvedValue({
      redirectTo: "/project/project-1/traces",
    });
    mocks.updateSessionMock.mockResolvedValue(undefined);
  });

  it("does not show the survey again after completion remounts onboarding", async () => {
    mocks.updateSessionMock.mockReturnValueOnce(new Promise(() => undefined));

    const { unmount } = render(<OnboardingSurvey />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Reddit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => {
      expect(mocks.completeMutateAsyncMock).toHaveBeenCalledWith({
        referralSource: "Reddit",
      });
      expect(mocks.statusSetDataMock).toHaveBeenCalledWith(undefined, {
        completed: true,
        redirectTo: "/project/project-1/traces",
      });
      expect(screen.getByText("Setting up your project")).toBeInTheDocument();
    });

    unmount();
    await act(async () => {
      render(<OnboardingSurvey />);
      await Promise.resolve();
    });

    expect(screen.getByText("Setting up your project")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
