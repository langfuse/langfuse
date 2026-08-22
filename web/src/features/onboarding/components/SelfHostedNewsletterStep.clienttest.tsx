import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SelfHostedNewsletterStep } from "./SelfHostedNewsletterStep";

const mocks = vi.hoisted(() => {
  return {
    completeMutateAsyncMock: vi.fn(),
    subscribeMutateAsyncMock: vi.fn(),
    routerMock: {
      replace: vi.fn(),
    },
    statusSetDataMock: vi.fn(),
    statusUseQueryMock: vi.fn(),
    newsletterStatusUseQueryMock: vi.fn(),
    updateSessionMock: vi.fn(),
    showErrorToastMock: vi.fn(),
  };
});

vi.mock("next/router", () => ({
  useRouter: () => mocks.routerMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { email: "engineer@acme.com" } },
    status: "authenticated",
    update: mocks.updateSessionMock,
  }),
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: mocks.showErrorToastMock,
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
      newsletterStatus: {
        useQuery: mocks.newsletterStatusUseQueryMock,
      },
      complete: {
        useMutation: () => ({
          mutateAsync: mocks.completeMutateAsyncMock,
        }),
      },
      subscribeToNewsletter: {
        useMutation: () => ({
          mutateAsync: mocks.subscribeMutateAsyncMock,
        }),
      },
    },
  },
}));

describe("SelfHostedNewsletterStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.statusUseQueryMock.mockReturnValue({
      data: { completed: false },
      isError: false,
      isLoading: false,
    });
    mocks.newsletterStatusUseQueryMock.mockReturnValue({
      data: { available: true },
      isError: false,
      isLoading: false,
    });
    mocks.completeMutateAsyncMock.mockResolvedValue({ redirectTo: "/setup" });
    mocks.updateSessionMock.mockResolvedValue(undefined);
  });

  it("prefills the signed-in email and records the opt-in on success", async () => {
    mocks.subscribeMutateAsyncMock.mockResolvedValue({ status: "subscribed" });

    render(<SelfHostedNewsletterStep />);

    expect(screen.getByRole("textbox")).toHaveValue("engineer@acme.com");

    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => {
      expect(mocks.subscribeMutateAsyncMock).toHaveBeenCalledWith({
        email: "engineer@acme.com",
      });
      expect(mocks.completeMutateAsyncMock).toHaveBeenCalledWith({
        newsletterOptIn: true,
      });
      expect(mocks.routerMock.replace).toHaveBeenCalledWith("/setup");
    });
  });

  it("subscribes the edited email rather than the session email", async () => {
    mocks.subscribeMutateAsyncMock.mockResolvedValue({ status: "subscribed" });

    render(<SelfHostedNewsletterStep />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "ops@acme.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => {
      expect(mocks.subscribeMutateAsyncMock).toHaveBeenCalledWith({
        email: "ops@acme.com",
      });
    });
  });

  it("falls back to the hosted form when the instance cannot reach langfuse.com", async () => {
    mocks.subscribeMutateAsyncMock.mockResolvedValue({ status: "unavailable" });

    render(<SelfHostedNewsletterStep />);

    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => {
      expect(
        screen.getByText(/could not reach langfuse\.com/i),
      ).toBeInTheDocument();
    });

    // Onboarding must not be blocked by an unreachable signup endpoint. The URL
    // is spelled out so it stays usable from a machine that cannot follow links.
    expect(
      screen.getByRole("link", {
        name: "https://langfuse.com/self-hosting/oss-newsletter",
      }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/self-hosting/oss-newsletter",
    );
    expect(mocks.completeMutateAsyncMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mocks.completeMutateAsyncMock).toHaveBeenCalledWith({
        newsletterOptIn: false,
      });
    });
  });

  it("explains where the address goes, including the opt-outs and the admin flag", async () => {
    const { container } = render(<SelfHostedNewsletterStep />);

    // The ⓘ trigger is an icon with no accessible role of its own.
    const infoTrigger = container.querySelector(".lucide-info")?.parentElement;
    expect(infoTrigger).toBeTruthy();

    fireEvent.click(infoTrigger as Element);

    await waitFor(() => {
      expect(
        screen.getByText(/Langfuse OSS mailing list/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/monthly updates/i)).toBeInTheDocument();
    expect(screen.getByText(/unsubscribe/i)).toBeInTheDocument();
    // The outbound request and the admin opt-out are the two facts a reviewer
    // would otherwise have to read the source to discover.
    expect(
      screen.getByText("https://langfuse.com/api/productUpdateSignup"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("LANGFUSE_DISABLE_SIGNUP_ONBOARDING=true"),
    ).toBeInTheDocument();
  });

  it("skips straight to completion and records the decline", async () => {
    render(<SelfHostedNewsletterStep />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(mocks.completeMutateAsyncMock).toHaveBeenCalledWith({
        newsletterOptIn: false,
      });
    });
    expect(mocks.subscribeMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("offers no form when in-product signup is disabled on the instance", () => {
    mocks.newsletterStatusUseQueryMock.mockReturnValue({
      data: { available: false },
      isError: false,
      isLoading: false,
    });

    render(<SelfHostedNewsletterStep />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(/turned off on this instance/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("does not show the step again once onboarding is complete", async () => {
    mocks.statusUseQueryMock.mockReturnValue({
      data: { completed: true, redirectTo: "/project/project-1/traces" },
      isError: false,
      isLoading: false,
    });

    render(<SelfHostedNewsletterStep />);

    await waitFor(() => {
      expect(mocks.routerMock.replace).toHaveBeenCalledWith(
        "/project/project-1/traces",
      );
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
