import { fireEvent, render, screen } from "@testing-library/react";
import SpielwieseIntroPage from "./SpielwieseIntroPage";

const renderIntroPage = () => render(<SpielwieseIntroPage />);

function expectTimelineLocLink({ date, href }: { date: string; href: string }) {
  const timelineLink = screen.getByRole("link", {
    name: `loc for ${date}`,
  });

  expect(timelineLink).toBeTruthy();
  expect(timelineLink.getAttribute("href")).toBe(href);

  return timelineLink;
}

it("renders the intro header and roadmap metadata", () => {
  renderIntroPage();

  const root = screen.getByTestId("spielwiese-intro-page");

  expect(root).toBeTruthy();
  expect(root.style.colorScheme).toBe("light");
  expect(root.style.getPropertyValue("--background")).toBe("0 0% 100%");
  expect(
    screen.getByRole("heading", {
      name: "Challenge: Redesign Langfuse in 7 days in code",
    }),
  ).toBeTruthy();
  expect(screen.getByText("by evren dombak")).toBeTruthy();
  const prLink = screen.getByRole("link", { name: "link to PR" });
  expect(prLink.getAttribute("href")).toBe(
    "https://github.com/langfuse/langfuse/pull/13133",
  );
  expect(prLink.className).toContain("border-[rgba(0,0,0,0.18)]");
  expect(prLink.className).toContain("text-[rgba(0,0,0,0.46)]");
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
      name: "Timeline",
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
    screen.getByText(
      "also when a user enters the langfuse dashboard, the first thing they see is an empty data dashboard. i questioned that. why do users sign up for langfuse in the first place? what is their mental state?",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "the state i identified: they have an ai product with prompts already that they didn't instrument yet and want to do so now in order to improve them.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "the aha moment is the moment a user sees what is wrong with their prompt and what to change. langfuse currently tries to bring users there through monitoring as a first touchpoint. but monitoring alone, before any evaluation has run, doesn't get them there.",
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

it("renders the timeline tldr and collapsed details trigger", () => {
  renderIntroPage();
  const timelineBody = screen.getByTestId(
    "spielwiese-intro-section-body-timeline",
  );
  const timelineDetails = screen.getByTestId(
    "spielwiese-intro-timeline-details",
  );

  expect(
    screen.getByRole("heading", {
      level: 3,
      name: "Timeline",
    }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "tldr: intensest work stretch was sat apr 11 to mon apr 13, with 61k loc. that's where the prompt engineering flow, case-study onboarding, and onboarding all came together.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("details")).toBeTruthy();
  expect(
    screen.getByTestId("spielwiese-intro-timeline-details-chevron"),
  ).toBeTruthy();
  expect(
    screen
      .getByTestId("spielwiese-intro-timeline-details-chevron")
      .getAttribute("class"),
  ).toContain("transition-[color,transform]");
  expect(
    screen
      .getByTestId("spielwiese-intro-timeline-details-chevron")
      .getAttribute("class"),
  ).toContain("-rotate-90");
  expect(
    screen
      .getByTestId("spielwiese-intro-timeline-details-chevron")
      .getAttribute("class"),
  ).toContain("group-open/timeline:rotate-0");
  expect(
    screen
      .getByTestId("spielwiese-intro-timeline-details-chevron")
      .getAttribute("class"),
  ).toContain("group-hover/timeline-trigger:text-[rgba(0,0,0,0.68)]");
  expect(
    screen.getByTestId("spielwiese-intro-timeline-details-trigger").className,
  ).toContain("group/timeline-trigger");
  expect(timelineDetails.hasAttribute("open")).toBe(false);
  expect((timelineBody.firstChild as HTMLElement).className).toContain("gap-0");
});

it("renders the expanded daily timeline entries", () => {
  renderIntroPage();
  const timelineBody = screen.getByTestId(
    "spielwiese-intro-section-body-timeline",
  );
  const timelineDetails = screen.getByTestId(
    "spielwiese-intro-timeline-details",
  );

  fireEvent.click(
    screen.getByTestId("spielwiese-intro-timeline-details-trigger"),
  );

  expect(timelineDetails.hasAttribute("open")).toBe(true);

  const timelineItems = timelineBody.querySelectorAll(
    "[data-testid^='spielwiese-intro-timeline-item-']",
  );

  expect(screen.getByText("tue apr 7")).toBeTruthy();
  expect(
    screen.getByText(
      "built product shell with mock auth & mock apis and routed preview for setting up the workspace workflow based and not feature based.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("16k loc")).toBeTruthy();
  expect(screen.getByText("tue apr 14")).toBeTruthy();
  expect(screen.getByText("1k loc")).toBeTruthy();
  expect(timelineItems[0]?.textContent).toContain("tue apr 7");
  expect(timelineItems[0]?.textContent).toContain(
    "built product shell with mock auth & mock apis",
  );
  expect(screen.getByText("16k loc").className).toContain(
    "text-[rgba(0,0,0,0.46)]",
  );
  expect(
    expectTimelineLocLink({
      date: "tue apr 7",
      href: "https://github.com/langfuse/langfuse/compare/main...03bac0d44c3a24e3ffc5fe0433b73c732e5bfc29",
    }).className,
  ).toContain("border-b");
  expect(
    expectTimelineLocLink({
      date: "tue apr 14",
      href: "https://github.com/langfuse/langfuse/compare/900ac296111f718b51e6d5bb28e9a2dd35caa125...1067e2def3a67f415eadbbd1546d8d5ab5daab4c",
    }).className,
  ).toContain("text-[rgba(0,0,0,0.46)]");
  expect(
    expectTimelineLocLink({
      date: "tue apr 7",
      href: "https://github.com/langfuse/langfuse/compare/main...03bac0d44c3a24e3ffc5fe0433b73c732e5bfc29",
    }).className,
  ).toContain("text-sm/5");
  expect(
    expectTimelineLocLink({
      date: "tue apr 7",
      href: "https://github.com/langfuse/langfuse/compare/main...03bac0d44c3a24e3ffc5fe0433b73c732e5bfc29",
    }).parentElement?.className,
  ).toContain("justify-between");
  expect(screen.getByText("16k loc").parentElement?.className).toContain(
    "items-baseline",
  );
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
