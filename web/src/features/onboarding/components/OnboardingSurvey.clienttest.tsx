import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SurveyFormData } from "../lib/surveyTypes";

const { pushMock, updateSessionMock, mutateAsyncMock, useSurveyFormMock } =
  vi.hoisted(() => ({
    pushMock: vi.fn(),
    updateSessionMock: vi.fn(),
    mutateAsyncMock: vi.fn(),
    useSurveyFormMock: vi.fn(),
  }));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    update: updateSessionMock,
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    onboarding: {
      complete: {
        useMutation: () => ({
          mutateAsync: mutateAsyncMock,
        }),
      },
    },
  },
}));

vi.mock("@/src/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/components/ui/button", () => ({
  Button: ({
    children,
    type = "button",
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/src/components/LangfuseLogo", () => ({
  LangfuseIcon: () => <div data-testid="langfuse-icon" />,
}));

vi.mock("./SurveyProgress", () => ({
  SurveyProgress: () => <div data-testid="survey-progress" />,
}));

vi.mock("./SurveyStep", () => ({
  SurveyStep: () => <div data-testid="survey-step" />,
}));

vi.mock("../hooks/useSurveyForm", () => ({
  useSurveyForm: useSurveyFormMock,
}));

import { OnboardingSurvey } from "./OnboardingSurvey";

type SurveyValues = Partial<Record<keyof SurveyFormData, string | undefined>>;

const makeForm = (values: SurveyValues) => ({
  control: {},
  handleSubmit:
    (callback: (data: SurveyFormData) => Promise<void> | void) => async () =>
      await callback(values as SurveyFormData),
  setFocus: vi.fn(),
  watch: (field: keyof SurveyFormData) => values[field],
});

const makeSurveyHookResult = ({
  values,
  handleSubmit = vi.fn().mockResolvedValue(undefined),
}: {
  values: SurveyValues;
  handleSubmit?: ReturnType<typeof vi.fn>;
}) => ({
  form: makeForm(values),
  state: { currentStep: 2 },
  currentQuestion: {
    id: "referralSource",
    type: "text" as const,
    question: "Where did you hear about us?",
  },
  isLastStep: true,
  isFirstStep: false,
  goNext: vi.fn(),
  goBack: vi.fn(),
  handleAutoAdvance: vi.fn(),
  handleSubmit,
  totalSteps: 3,
});

describe("OnboardingSurvey", () => {
  beforeEach(() => {
    pushMock.mockReset();
    pushMock.mockResolvedValue(true);
    updateSessionMock.mockReset();
    updateSessionMock.mockResolvedValue(undefined);
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({
      redirectTo: "/project/project-1/traces",
    });
    useSurveyFormMock.mockReset();
  });

  it("redirects to the onboarding completion target after finishing the survey", async () => {
    const values: SurveyValues = {
      role: "Software Engineer",
      signupReason: "Start using Langfuse",
      referralSource: "GitHub",
    };
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    useSurveyFormMock.mockReturnValue(
      makeSurveyHookResult({
        values,
        handleSubmit,
      }),
    );

    render(<OnboardingSurvey />);

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(values);
    });
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    expect(updateSessionMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/project/project-1/traces");
  });

  it("redirects to the onboarding completion target when skipping the last step", async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    useSurveyFormMock.mockReturnValue(
      makeSurveyHookResult({
        values: {
          role: undefined,
          signupReason: undefined,
          referralSource: undefined,
        },
        handleSubmit,
      }),
    );

    render(<OnboardingSurvey />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(handleSubmit).not.toHaveBeenCalled();
    expect(updateSessionMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/project/project-1/traces");
  });
});
