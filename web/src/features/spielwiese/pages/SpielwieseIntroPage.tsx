import Link from "next/link";
import { spielwieseSetupMomentContent } from "../components/spielwieseSetupMomentContent";

const introLinkClassName =
  "text-[rgba(17,17,17,1)] transition-opacity duration-150 hover:opacity-70";
const introSectionTitleClassName =
  "text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.4)]";

function IntroRoutesParagraph() {
  return (
    <>
      You can start directly with the{" "}
      <Link className={introLinkClassName} href="/dev/spielwiese/onboarding">
        onboarding flow
      </Link>{" "}
      or jump into the{" "}
      <Link
        className={introLinkClassName}
        href="/dev/spielwiese/dashboard#home"
      >
        dashboard
      </Link>{" "}
      if you want to inspect the core canvas first.
    </>
  );
}

function IntroTextSection({
  paragraphs,
  title,
}: {
  paragraphs: readonly string[];
  title: string;
}) {
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
        className="pt-[0.735rem] sm:pl-[6.75rem]"
        data-testid={`spielwiese-intro-section-body-${title.toLowerCase()}`}
      >
        <div className="grid gap-0">
          {paragraphs.map((paragraph) => (
            <p
              className="max-w-[66ch] text-sm/5 font-[460] tracking-[-0.0056rem] text-pretty text-[rgba(17,17,17,1)]"
              key={paragraph}
            >
              {title === "Routes" ? <IntroRoutesParagraph /> : paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function IntroArticle() {
  return (
    <article className="grid gap-0" data-testid="spielwiese-intro-article">
      <header className="flex flex-wrap items-baseline gap-1 pb-2">
        <h1 className="balance text-sm/5 font-medium tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
          {spielwieseSetupMomentContent.title}
        </h1>
        <time className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.4)]">
          {spielwieseSetupMomentContent.updatedAt}
        </time>
      </header>
      <div className="grid gap-0">
        {spielwieseSetupMomentContent.sections.map((section) => (
          <IntroTextSection
            key={section.title}
            paragraphs={section.paragraphs}
            title={section.title}
          />
        ))}
      </div>
    </article>
  );
}

function IntroVideoSection() {
  return (
    <section className="pt-12" data-testid="spielwiese-intro-video-section">
      <section
        className="grid gap-0"
        data-testid="spielwiese-intro-video-shell"
      >
        <div className="pt-[0.735rem] sm:pl-[6.75rem]">
          <div className="grid min-h-[17rem] place-items-center border border-[rgba(0,0,0,0.08)] bg-[rgba(247,247,247,0.7)]">
            <p className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.4)]">
              {spielwieseSetupMomentContent.videoNote}
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}

function IntroFooter() {
  return (
    <footer className="pt-10 pb-20" data-testid="spielwiese-intro-footer">
      <div className="grid justify-items-start gap-3">
        <p className="max-w-[48ch] text-[0.8125rem] font-[460] tracking-[-0.0025rem] text-pretty text-[rgba(0,0,0,0.4)]">
          {spielwieseSetupMomentContent.footer}
        </p>
        <Link
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white px-3 text-sm/5 font-medium tracking-[-0.0056rem] text-[rgba(17,17,17,1)] shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-[transform,box-shadow,opacity] duration-150 hover:opacity-84 hover:shadow-[0_2px_4px_rgba(15,23,42,0.08)] active:scale-[0.985]"
          data-testid="spielwiese-intro-enter-link"
          href="/dev/spielwiese/onboarding"
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
    >
      <div className="min-h-dvh bg-white">
        <main className="mx-auto w-full max-w-[34.375rem] px-5 pt-20 sm:px-0">
          <IntroArticle />
          <IntroVideoSection />
          <IntroFooter />
        </main>
      </div>
    </div>
  );
}
