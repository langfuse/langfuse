import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import {
  getOnboardingPersonalDetailsPath,
  getOnboardingStepPath,
  PERSONAL_DETAILS_STEP_ID,
} from "../onboarding/spielwieseOnboardingFlow";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = jest.mocked(useRouter);
const push = jest.fn();
let asPath = "/dev/spielwiese/onboarding";

function mockRouter() {
  mockedUseRouter.mockReturnValue({
    asPath,
    push,
  } as ReturnType<typeof useRouter>);
}

function expectPersonalDetailsChrome(container: HTMLElement) {
  expect(
    screen.getByTestId("spielwiese-onboarding-personal-details"),
  ).toBeTruthy();
  expect(screen.getByText("Let's get to know you")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Upload image" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
    }),
  ).toBeTruthy();
  expect(screen.queryByTestId("spielwiese-onboarding-canvas")).toBeNull();
  expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
  expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
}

function expectCanCodeOptions() {
  expect(
    screen.getByRole("option", { name: "No, but Claude can" }),
  ).toBeTruthy();
  expect(screen.getByRole("option", { name: "I'd rather not" })).toBeTruthy();
  expect(
    screen.getByRole("option", {
      name: "Yes and I did so without the help of Claude and co.",
    }),
  ).toBeTruthy();
}

beforeEach(() => {
  push.mockReset();
  asPath = "/dev/spielwiese/onboarding";
  mockRouter();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("SpielwieseOnboardingPage sign-up basics", () => {
  it("uses a routed personal details path instead of a hash route", () => {
    expect(getOnboardingPersonalDetailsPath()).toBe(
      "/dev/spielwiese/onboarding/personal-details",
    );
  });

  it("renders the onboarding root as a sign-up screen", () => {
    const { container } = render(<SpielwieseOnboardingPage />);
    const welcomeHeading = screen.getByRole("heading", {
      name: "Welcome to Langfuse.",
    });
    const logoStrip = screen.getByTestId("spielwiese-onboarding-logo-strip");
    const wordmarkImage = screen
      .getByRole("button", { name: "Langfuse" })
      .querySelector("img");

    expect(screen.getByTestId("spielwiese-onboarding-sign-up")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(
      screen.getByPlaceholderText("walter.white@polloshermanos.com"),
    ).toBeTruthy();
    expect(logoStrip.querySelectorAll("img")).toHaveLength(4);
    expect(logoStrip.querySelector("img")?.getAttribute("src")).toContain(
      "brand-a.png",
    );
    expect(screen.queryByRole("img", { name: "Samsara" })).toBeNull();
    expect(screen.getByRole("img", { name: "Twilio" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Canva" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Apple" })).toBeTruthy();
    expect(
      screen.queryByText("By inserting your email you confirm that"),
    ).toBeNull();
    expect(welcomeHeading.parentElement?.className).toContain(
      "translate-y-[-5px]",
    );
    expect(wordmarkImage?.getAttribute("src")).toBe(
      "/spielwiese/lf-onboarding-wordmark.png",
    );
    expect(screen.queryByTestId("spielwiese-onboarding-canvas")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell-header")).toBeNull();
    expect(screen.queryByTestId("spielwiese-left-sidebar")).toBeNull();
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("keeps the sign-in button inert but advances on continue", () => {
    render(<SpielwieseOnboardingPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Google" }),
    );

    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith(
      getOnboardingPersonalDetailsPath(),
      undefined,
      { scroll: false, shallow: true },
    );
  });
});

describe("SpielwieseOnboardingPage personal details layout", () => {
  it("renders the personal details route without dashboard shell chrome", () => {
    asPath = getOnboardingPersonalDetailsPath();
    mockRouter();
    const { container } = render(
      <SpielwieseOnboardingPage stepId={PERSONAL_DETAILS_STEP_ID} />,
    );

    expectPersonalDetailsChrome(container);
  });

  it("renders the staged personal details form with dropdown fields", () => {
    asPath = getOnboardingPersonalDetailsPath();
    mockRouter();
    render(<SpielwieseOnboardingPage stepId={PERSONAL_DETAILS_STEP_ID} />);

    expect(screen.queryByText("Temporary placeholder")).toBeNull();
    expect(screen.queryByText("First name")).toBeNull();
    expect(screen.queryByText("Last name")).toBeNull();
    expect(screen.queryByText("Email")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Full name" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Position" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Can you code" })).toBeTruthy();
    expect(screen.getByText("Let's get to know you").className).toContain(
      "[transition-delay:0ms]",
    );
    expect(
      screen.getByRole("button", { name: "Continue" }).className,
    ).toContain("[transition-delay:250ms]");

    fireEvent.click(screen.getByRole("combobox", { name: "Can you code" }));

    expectCanCodeOptions();
  });
});

describe("SpielwieseOnboardingPage personal details transition", () => {
  it("advances only after the personal details exit transition completes", () => {
    render(<SpielwieseOnboardingPage stepId={PERSONAL_DETAILS_STEP_ID} />);

    expect(screen.queryByTestId("spielwiese-onboarding-step")).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("spielwiese-personal-details-form-panel").className,
    ).toContain("opacity-0");
    expect(
      screen.getByTestId("spielwiese-onboarding-entry-layer").className,
    ).toContain("opacity-0");
    expect(screen.queryByTestId("spielwiese-onboarding-step")).toBeNull();

    fireEvent.transitionEnd(
      screen.getByTestId("spielwiese-onboarding-entry-layer"),
      {
        propertyName: "opacity",
      },
    );

    expect(push).toHaveBeenCalledWith(
      getOnboardingStepPath("role"),
      undefined,
      { scroll: false, shallow: true },
    );
  });
});

describe("SpielwieseOnboardingPage personal details compatibility", () => {
  it("still supports the legacy personal details step slug", () => {
    render(<SpielwieseOnboardingPage stepId={PERSONAL_DETAILS_STEP_ID} />);

    expect(
      screen.getByTestId("spielwiese-onboarding-personal-details"),
    ).toBeTruthy();
  });

  it("renders the updated footer copy and designer hover caption", () => {
    render(<SpielwieseOnboardingPage />);
    const wordmarkCaption = screen.getByTestId(
      "spielwiese-onboarding-wordmark-caption",
    );

    expect(
      screen.getByRole("button", {
        name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
      }),
    ).toBeTruthy();
    expect(screen.getByText("for the fun of it")).toBeTruthy();
    expect(
      screen.getByTestId("spielwiese-onboarding-wordmark-hover-zone"),
    ).toBeTruthy();
    expect(wordmarkCaption.className).toContain("transition-opacity");
    expect(wordmarkCaption.className).toContain("group-hover:opacity-100");
    expect(wordmarkCaption.className).not.toContain("-translate-x-1");
    expect(wordmarkCaption.className).not.toContain(
      "group-hover:translate-x-0",
    );
  });
});

describe("SpielwieseOnboardingPage routed steps", () => {
  it("renders the stripped-down onboarding route without dashboard shell chrome", () => {
    const { container } = render(<SpielwieseOnboardingPage stepId="role" />);

    expect(screen.getByTestId("spielwiese-onboarding-step")).toBeTruthy();
    expect(screen.getByTestId("spielwiese-onboarding-step-layer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Langfuse" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "© 2022-2026 Langfuse GmbH / Finto Technologies Inc.",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeNull();
    expect(
      screen.queryByTestId("spielwiese-onboarding-questionnaire"),
    ).toBeNull();
    expect(screen.getByText("Do you know what to build?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "No" }).getAttribute("disabled"),
    ).not.toBeNull();
    expect(
      screen.queryByText(
        "Pick the closest answer. We can tune the room from there.",
      ),
    ).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell")).toBeNull();
    expect(screen.queryByTestId("spielwiese-shell-header")).toBeNull();
    expect(screen.queryByTestId("spielwiese-left-sidebar")).toBeNull();
    expect(
      screen.getByTestId("spielwiese-onboarding-surface-shell").className,
    ).toContain("bg-transparent");
    expect(
      screen.getByTestId("spielwiese-onboarding-surface-shell").className,
    ).toContain("max-w-[36rem]");
    expect(
      screen.getByTestId("spielwiese-onboarding-surface-shell").className,
    ).toContain("shadow-none");
    expect(
      screen.getByTestId("spielwiese-onboarding-surface-shell").className,
    ).toContain("border-0");
    expect(container.querySelector("[data-spielwiese]")).toBeTruthy();
  });

  it("keeps the first question active until earlier answers exist", () => {
    render(<SpielwieseOnboardingPage stepId="intent" />);

    expect(screen.queryByTestId("spielwiese-onboarding-step-label")).toBeNull();
    expect(screen.getByText("Do you know what to build?")).toBeTruthy();
    expect(
      screen.queryByTestId("spielwiese-onboarding-upper-canvas"),
    ).toBeNull();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByText("Why are you opening this room?")).toBeNull();
  });
});
