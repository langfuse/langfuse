import { render, screen } from "@testing-library/react";
import SpielwieseIntroPage from "./SpielwieseIntroPage";

const renderIntroPage = () => render(<SpielwieseIntroPage />);

it("renders the intro header and roadmap metadata", () => {
  renderIntroPage();

  expect(screen.getByTestId("spielwiese-intro-page")).toBeTruthy();
  expect(
    screen.getByRole("heading", {
      name: "Langfuse redesign",
    }),
  ).toBeTruthy();
  expect(screen.getByText("by evren dombak")).toBeTruthy();
  const prLink = screen.getByRole("link", { name: "Link to PR" });
  expect(prLink.getAttribute("href")).toBe(
    "https://github.com/langfuse/langfuse/pull/13133",
  );
  expect(screen.getByText("roadmap items:")).toBeTruthy();
  expect(screen.getByText("- improve onboarding experience")).toBeTruthy();
  expect(
    screen.getByText(
      "- improve core screens, especially for new and non-technical users",
    ),
  ).toBeTruthy();

  const roadmapLink = screen.getByRole("link", {
    name: "https://arc.net/l/quote/iwaglpky",
  });
  expect(roadmapLink.getAttribute("href")).toBe(
    "https://arc.net/l/quote/iwaglpky",
  );
  expect(
    screen.getByTestId("spielwiese-intro-roadmap-items").className,
  ).toContain("pb-6");
});

it("renders the approach and outcome sections", () => {
  renderIntroPage();

  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "Approach",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "Colophon",
    }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "today's langfuse is built around features: traces, evaluations, monitoring. yet, the users don't think in features but in the problem they're trying to solve.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-intro-section-divider-approach"),
  ).toBeTruthy();
  expect(
    screen.queryByText(
      "The result is a guided prototype with three parts: an intro that frames the thinking, an onboarding flow that sets up intent, and a dashboard that shows how the redesigned system could feel in use.",
    ),
  ).toBeNull();
  expect(
    screen.queryByText(
      "This page is the framing layer. The next screens are the product layer.",
    ),
  ).toBeNull();
});

it("renders the colophon links and skills subsection", () => {
  renderIntroPage();

  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "Colophon",
    }),
  ).toBeTruthy();

  const conductorLink = screen.getByRole("link", { name: "Conductor" });
  const codexLink = screen.getByRole("link", { name: "Codex" });
  const paperDesignLink = screen.getByRole("link", { name: "Paper design" });

  expect(conductorLink.getAttribute("href")).toBe(
    "https://www.conductor.build/",
  );
  expect(conductorLink.className).toContain("border-b");
  expect(conductorLink.className).toContain("text-[rgba(0,0,0,0.46)]");
  expect(codexLink.getAttribute("href")).toBe("https://chatgpt.com/codex/");
  expect(paperDesignLink.getAttribute("href")).toBe("https://paper.design/");
  expect(screen.getByText("Skills:")).toBeTruthy();
  expect(screen.getByText("Skills:").className).toContain("pt-3");
  expect(screen.getByRole("link", { name: "ui.sh" }).getAttribute("href")).toBe(
    "https://ui.sh/",
  );
  expect(
    screen
      .getByRole("link", { name: "Vercel React Best Practices" })
      .getAttribute("href"),
  ).toBe("https://vercel.com/blog/introducing-react-best-practices");
  expect(
    screen.getByRole("link", { name: "emil.md" }).getAttribute("href"),
  ).toBe("https://animations.dev/learn/emil-skill");
  expect(
    screen.getByRole("link", { name: "shadcn/ui" }).getAttribute("href"),
  ).toBe("https://ui.shadcn.com/docs/skills");
  expect(
    (
      screen.getByTestId("spielwiese-intro-section-body-colophon")
        .firstChild as HTMLElement
    ).className,
  ).toContain("gap-0");
});

it("renders the embedded image and video placeholders inside the article", () => {
  renderIntroPage();

  expect(screen.getByTestId("spielwiese-intro-article")).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-intro-setup-moment-image"),
  ).toBeTruthy();
  expect(
    screen.queryByText("[ image of setup, aha, habit moment ]"),
  ).toBeNull();
  expect(screen.getByTestId("spielwiese-intro-video-shell")).toBeTruthy();
});

it("renders the centered footer call to action", () => {
  renderIntroPage();

  expect(screen.getByText("Time for you to experience it")).toBeTruthy();
  expect(
    (screen.getByTestId("spielwiese-intro-footer").firstChild as HTMLElement)
      .className,
  ).toContain("justify-items-center");
  expect(
    screen.getByTestId("spielwiese-intro-enter-link").getAttribute("href"),
  ).toBe("/dev/spielwiese/onboarding");
});
