import Link from "next/link";
import type { ReactNode } from "react";
import {
  currentDashboardImageMarker,
  setupMomentImageMarker,
  SpielwieseIntroCurrentDashboardImage,
  SpielwieseIntroSetupMomentImage,
  SpielwieseIntroVideoPlaceholder,
  videoPlaceholderMarker,
} from "../components/SpielwieseIntroMedia";
import { SpielwieseIntroTimelineEntries } from "../components/SpielwieseIntroTimelineEntries";
import {
  type SpielwieseIntroTimelineEntry,
  spielwieseSetupMomentContent,
} from "../components/spielwieseSetupMomentContent";
import { preloadSpielwieseSignUpShader } from "../onboarding/components/spielwieseSignUpShaderPreload";
import { spielwieseLightThemeStyle } from "../spielwieseLightTheme";

preloadSpielwieseSignUpShader();

const introLinkClassName =
  "text-[rgba(17,17,17,1)] transition-opacity duration-150 hover:opacity-70";
const colophonLinkClassName =
  "border-b border-[rgba(0,0,0,0.18)] pb-[0.05rem] text-[rgba(0,0,0,0.46)] transition-[color,border-color] duration-150 hover:border-[rgba(0,0,0,0.32)] hover:text-[rgba(0,0,0,0.68)]";
const introSectionTitleClassName =
  "text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.4)]";
const colophonUrlPattern = /\[([^\]]+)\]/g;

function isCompactIntroSection(title: string) {
  return title === "Colophon" || title === "Timeline";
}

function isTimelineSection(
  section: (typeof spielwieseSetupMomentContent.sections)[number],
): section is Extract<
  (typeof spielwieseSetupMomentContent.sections)[number],
  { timelineEntries: readonly SpielwieseIntroTimelineEntry[] }
> {
  return "timelineEntries" in section;
}

function splitColophonLabel(segment: string): {
  prefix: string;
  label: string;
} {
  const separators = [" with ", "- "];

  let splitIndex = -1;
  let splitLength = 0;

  for (const separator of separators) {
    const index = segment.lastIndexOf(separator);

    if (index > splitIndex) {
      splitIndex = index;
      splitLength = separator.length;
    }
  }

  if (splitIndex === -1) {
    return {
      label: segment.trimEnd(),
      prefix: "",
    };
  }

  return {
    label: segment.slice(splitIndex + splitLength).trimEnd(),
    prefix: segment.slice(0, splitIndex + splitLength),
  };
}

function renderColophonParagraph(paragraph: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of paragraph.matchAll(colophonUrlPattern)) {
    const matchIndex = match.index ?? 0;
    const segment = paragraph.slice(lastIndex, matchIndex);
    const { label, prefix } = splitColophonLabel(segment);

    if (prefix) {
      nodes.push(prefix);
    }

    nodes.push(
      <a
        className={colophonLinkClassName}
        href={match[1]}
        key={`${match[1]}-${matchIndex}`}
        rel="noreferrer"
        target="_blank"
      >
        {label}
      </a>,
    );

    lastIndex = matchIndex + match[0].length;
  }

  const trailingText = paragraph.slice(lastIndex);

  if (trailingText) {
    nodes.push(trailingText);
  }

  return nodes;
}

function IntroTextItem({
  isColophon,
  paragraph,
}: {
  isColophon: boolean;
  paragraph: string;
}) {
  if (paragraph === setupMomentImageMarker) {
    return <SpielwieseIntroSetupMomentImage />;
  }

  if (paragraph === currentDashboardImageMarker) {
    return <SpielwieseIntroCurrentDashboardImage />;
  }

  if (paragraph === videoPlaceholderMarker) {
    return <SpielwieseIntroVideoPlaceholder />;
  }

  const introTextItemClassName = `max-w-[66ch] text-sm/5 font-[460] tracking-[-0.0056rem] text-pretty text-[rgba(17,17,17,1)] ${
    isColophon && paragraph === "Skills:" ? "pt-3" : ""
  }`;

  return (
    <p className={introTextItemClassName}>
      {isColophon ? renderColophonParagraph(paragraph) : paragraph}
    </p>
  );
}

function IntroTextSection({
  section,
}: {
  section: (typeof spielwieseSetupMomentContent.sections)[number];
}) {
  const title = section.title;

  return (
    <section
      className="grid gap-0 pt-6 first:pt-0"
      data-testid={`spielwiese-intro-section-${title.toLowerCase()}`}
    >
      <h3 className={introSectionTitleClassName}>{title}</h3>
      <div
        className="mt-[0.15rem] h-px w-full bg-[rgba(0,0,0,0.08)]"
        data-testid={`spielwiese-intro-section-divider-${title.toLowerCase()}`}
      />
      <div
        className="pt-[0.735rem]"
        data-testid={`spielwiese-intro-section-body-${title.toLowerCase()}`}
      >
        {isTimelineSection(section) ? (
          <SpielwieseIntroTimelineEntries
            detailsLabel={section.detailsLabel}
            entries={section.timelineEntries}
            tldr={section.tldr}
          />
        ) : (
          <div
            className={`grid ${isCompactIntroSection(title) ? "gap-0" : "gap-5"}`}
          >
            {section.paragraphs.map((paragraph) => (
              <IntroTextItem
                isColophon={title === "Colophon"}
                key={paragraph}
                paragraph={paragraph}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function IntroRoadmapItems() {
  return (
    <div
      className="col-span-full grid gap-0 pt-[0.735rem] pb-6"
      data-testid="spielwiese-intro-roadmap-items"
    >
      <p className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
        roadmap items:
      </p>
      <p className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
        - improve onboarding experience
      </p>
      <p className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
        - improve core screens, especially for new and non-technical users
      </p>
      <p className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
        (
        <a
          className={introLinkClassName}
          href="https://arc.net/l/quote/iwaglpky"
          rel="noreferrer"
          target="_blank"
        >
          https://arc.net/l/quote/iwaglpky
        </a>
        )
      </p>
    </div>
  );
}

function IntroArticle() {
  return (
    <article className="grid gap-0" data-testid="spielwiese-intro-article">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 pb-2">
        <div className="flex flex-wrap items-baseline gap-1">
          <h1 className="balance text-sm/5 font-medium tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
            {spielwieseSetupMomentContent.title}
          </h1>
          <time className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.4)]">
            by evren dombak
          </time>
        </div>
        <p className="text-right text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.4)]">
          <a
            className={colophonLinkClassName}
            href="https://github.com/langfuse/langfuse/pull/13133"
            rel="noreferrer"
            target="_blank"
          >
            link to PR
          </a>
        </p>
        <IntroRoadmapItems />
      </header>
      <div className="grid gap-0">
        {spielwieseSetupMomentContent.sections.map((section) => (
          <IntroTextSection key={section.title} section={section} />
        ))}
      </div>
    </article>
  );
}

function IntroFooter() {
  function handleOnboardingLinkIntent() {
    preloadSpielwieseSignUpShader();
  }

  return (
    <footer className="pt-10 pb-20" data-testid="spielwiese-intro-footer">
      <div className="grid justify-items-center gap-3 text-center">
        <p className="max-w-[48ch] text-[0.8125rem] font-[460] tracking-[-0.0025rem] text-pretty text-[rgba(17,17,17,1)]">
          {spielwieseSetupMomentContent.footer}
        </p>
        <Link
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white px-3 text-sm/5 font-medium tracking-[-0.0056rem] text-[rgba(17,17,17,1)] shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-[transform,box-shadow,opacity] duration-150 hover:opacity-84 hover:shadow-[0_2px_4px_rgba(15,23,42,0.08)] active:scale-[0.985]"
          data-testid="spielwiese-intro-enter-link"
          href="/dev/spielwiese/onboarding"
          onFocus={handleOnboardingLinkIntent}
          onMouseEnter={handleOnboardingLinkIntent}
          onPointerDown={handleOnboardingLinkIntent}
        >
          Open onboarding
        </Link>
      </div>
    </footer>
  );
}

export default function SpielwieseIntroPage() {
  return (
    <div
      className="isolate min-h-dvh bg-white [font-family:Inter,ui-sans-serif,system-ui,sans-serif] text-[rgba(17,17,17,1)] antialiased"
      data-spielwiese
      data-testid="spielwiese-intro-page"
      style={spielwieseLightThemeStyle}
    >
      <div className="min-h-dvh bg-white">
        <main className="mx-auto w-full max-w-[34.375rem] px-5 pt-20 sm:px-0">
          <IntroArticle />
          <IntroFooter />
        </main>
      </div>
    </div>
  );
}
