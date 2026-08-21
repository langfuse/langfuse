import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ConnectedOnboardingSurvey } from "./ConnectedOnboardingSurvey";
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

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label"?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
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
    | { completed: false; canConfigureAiFeatures: boolean }
    | { completed: true; redirectTo: string };

  beforeEach(() => {
    vi.clearAllMocks();

    onboardingStatus = {
      completed: false,
      canConfigureAiFeatures: false,
    };
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

    const { unmount } = render(<ConnectedOnboardingSurvey />);

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
      render(<ConnectedOnboardingSurvey />);
      await Promise.resolve();
    });

    expect(screen.getByText("Setting up your project")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("enables AI features by default for a configurable starter organization", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <OnboardingSurvey
        state="form"
        canConfigureAiFeatures
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Enable AI powered features" }),
    ).toBeChecked();
    expect(
      screen.getByRole("heading", { name: "Organizational settings" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        referralSource: undefined,
        aiFeaturesEnabled: true,
      });
    });
  });

  it("submits an explicit AI features opt-out", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <OnboardingSurvey
        state="form"
        canConfigureAiFeatures
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Enable AI powered features" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        referralSource: undefined,
        aiFeaturesEnabled: false,
      });
    });
  });

  it("hides the AI features choice without a configurable starter organization", () => {
    render(
      <OnboardingSurvey
        state="form"
        canConfigureAiFeatures={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.queryByRole("switch", { name: "Enable AI powered features" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Organizational settings" }),
    ).not.toBeInTheDocument();
  });
});
