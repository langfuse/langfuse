import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SurveyFormData } from "../lib/surveyTypes";

const {
  replaceMock,
  updateSessionMock,
  mutateAsyncMock,
  useSurveyFormMock,
  showErrorToastMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  updateSessionMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
  useSurveyFormMock: vi.fn(),
  showErrorToastMock: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    replace: replaceMock,
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
  FormField: ({
    name,
    render,
  }: {
    name: string;
    render: (props: {
      field: {
        name: string;
        onBlur: ReturnType<typeof vi.fn>;
        onChange: ReturnType<typeof vi.fn>;
        ref: ReturnType<typeof vi.fn>;
        value: string;
      };
    }) => React.ReactNode;
  }) => (
    <>
      {render({
        field: {
          name,
          onBlur: vi.fn(),
          onChange: vi.fn(),
          ref: vi.fn(),
          value: "",
        },
      })}
    </>
  ),
  FormControl: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormItem: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={className}>{children}</div>
  ),
  FormLabel: ({
    children,
    className,
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label className={className}>{children}</label>
  ),
  FormMessage: () => null,
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

vi.mock("@/src/components/design-system/Spinner/Spinner", () => ({
  default: () => <div data-testid="onboarding-spinner" />,
}));

vi.mock("@/src/components/LangfuseLogo", () => ({
  LangfuseIcon: () => <div data-testid="langfuse-icon" />,
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: showErrorToastMock,
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
  handleSubmit,
});

describe("OnboardingSurvey", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    replaceMock.mockResolvedValue(true);
    updateSessionMock.mockReset();
    updateSessionMock.mockResolvedValue(undefined);
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({
      redirectTo: "/project/project-1/traces",
    });
    useSurveyFormMock.mockReset();
    showErrorToastMock.mockReset();
  });

  it("redirects to the onboarding completion target after finishing the survey", async () => {
    const values: SurveyValues = {
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
    expect(replaceMock).toHaveBeenCalledWith("/project/project-1/traces");
  });

  it("redirects to the onboarding completion target when skipping the last step", async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    useSurveyFormMock.mockReturnValue(
      makeSurveyHookResult({
        values: {
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
    expect(replaceMock).toHaveBeenCalledWith("/project/project-1/traces");
  });

  it("shows a stable finishing state while onboarding completion is in progress", async () => {
    let resolveMutation: ((value: { redirectTo: string }) => void) | undefined;
    mutateAsyncMock.mockReturnValue(
      new Promise<{ redirectTo: string }>((resolve) => {
        resolveMutation = resolve;
      }),
    );

    useSurveyFormMock.mockReturnValue(
      makeSurveyHookResult({
        values: {
          referralSource: undefined,
        },
      }),
    );

    render(<OnboardingSurvey />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(
      screen.getByRole("heading", { name: "Setting up your project" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Taking you to tracing...")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-spinner")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        "Colleague, Word of Mouth, X, Reddit, Event",
      ),
    ).not.toBeInTheDocument();

    resolveMutation?.({ redirectTo: "/project/project-1/traces" });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/project/project-1/traces");
    });
  });

  it("returns to the survey and shows an error toast if completion fails", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("boom"));

    useSurveyFormMock.mockReturnValue(
      makeSurveyHookResult({
        values: {
          referralSource: undefined,
        },
      }),
    );

    render(<OnboardingSurvey />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(
      screen.getByRole("heading", { name: "Setting up your project" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(showErrorToastMock).toHaveBeenCalledWith(
        "Failed to finish onboarding",
        "boom",
      );
    });

    expect(
      screen.getByPlaceholderText("Colleague, Word of Mouth, X, Reddit, Event"),
    ).toBeInTheDocument();
  });
});
