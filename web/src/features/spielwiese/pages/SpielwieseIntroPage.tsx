import Link from "next/link";
import { buttonVariants } from "../ui/button";
import { spielwieseSetupMomentContent } from "../components/spielwieseSetupMomentContent";

function IntroHero() {
  return (
    <section className="pt-8 pb-14 sm:pt-14 sm:pb-18">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 sm:px-8 lg:grid lg:grid-cols-[21fr_19fr] lg:gap-12">
        <div className="grid gap-6">
          <p className="font-mono text-[0.75rem] tracking-[0.18em] text-[rgba(91,71,55,0.82)] uppercase">
            {spielwieseSetupMomentContent.eyebrow}
          </p>
          <div className="grid gap-4">
            <h1 className="max-w-[14ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {spielwieseSetupMomentContent.title}
            </h1>
            {spielwieseSetupMomentContent.intro.map((paragraph) => (
              <p
                className="max-w-[58ch] text-base text-pretty text-[rgba(23,23,23,0.72)] sm:text-lg"
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              className={buttonVariants({
                className:
                  "h-10 rounded-full px-5 text-sm ring-1 ring-[rgba(91,71,55,0.18)]",
                size: "lg",
              })}
              data-testid="spielwiese-intro-enter-link"
              href="/dev/spielwiese/onboarding"
            >
              Enter
            </Link>
            <p className="text-sm text-[rgba(23,23,23,0.58)]">
              Start with the concept, then move into the product setup flow.
            </p>
          </div>
        </div>
        <div className="grid gap-4 self-start rounded-[28px] border border-[rgba(23,23,23,0.1)] bg-[rgba(255,250,245,0.84)] p-6 shadow-[0_24px_60px_rgba(28,18,10,0.08)]">
          <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
            Framing note
          </p>
          <p className="max-w-[34ch] text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {spielwieseSetupMomentContent.thesis}
          </p>
          <div className="h-px bg-[rgba(23,23,23,0.08)]" />
          <p className="max-w-[42ch] text-sm text-pretty text-[rgba(23,23,23,0.64)]">
            The intro page teaches. The next screens behave like product. The
            dashboard is the payoff, not another explanation layer.
          </p>
        </div>
      </div>
    </section>
  );
}

function IntroMomentsSection() {
  return (
    <section className="py-14 sm:py-18">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 sm:px-8">
        <div className="grid gap-3">
          <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
            Setup / aha / habit
          </p>
          <h2 className="max-w-[18ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            One designed moment, two contextual ones.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[21fr_19fr_19fr]">
          {spielwieseSetupMomentContent.moments.map((moment) => (
            <article
              className={
                moment.emphasis === "primary"
                  ? "grid gap-4 rounded-[28px] border border-[rgba(91,71,55,0.16)] bg-[rgba(255,249,242,0.94)] p-6 shadow-[0_24px_60px_rgba(28,18,10,0.08)]"
                  : "grid gap-4 rounded-[28px] border border-[rgba(23,23,23,0.08)] bg-white p-6"
              }
              data-testid={`spielwiese-intro-moment-${moment.id}`}
              key={moment.id}
            >
              <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
                {moment.kicker}
              </p>
              <h3 className="max-w-[18ch] text-2xl font-semibold tracking-tight text-balance">
                {moment.title}
              </h3>
              <p className="max-w-[42ch] text-base text-pretty text-[rgba(23,23,23,0.7)]">
                {moment.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function IntroArtifactsSection() {
  return (
    <section className="py-14 sm:py-18">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 sm:px-8">
        <div className="grid gap-3">
          <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
            Drawings and thinking
          </p>
          <h2 className="max-w-[20ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Leave room for your hand to stay visible.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {spielwieseSetupMomentContent.artifactSlots.map((slot) => (
            <article
              className="grid min-h-56 gap-4 rounded-[28px] border border-dashed border-[rgba(91,71,55,0.22)] bg-[rgba(250,245,239,0.72)] p-5"
              data-testid={`spielwiese-intro-artifact-${slot.id}`}
              key={slot.id}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
                  {slot.label}
                </p>
                <div className="size-3 rounded-full bg-[rgba(91,71,55,0.18)]" />
              </div>
              <div className="grid flex-1 place-items-center rounded-[20px] border border-[rgba(91,71,55,0.12)] bg-[rgba(255,255,255,0.7)]">
                <p className="max-w-[18ch] text-center text-base text-pretty text-[rgba(23,23,23,0.52)]">
                  {slot.note}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function IntroVideoSection() {
  return (
    <section className="py-14 sm:py-18">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 sm:px-8 lg:grid-cols-[19fr_21fr]">
        <div className="grid gap-3 self-start">
          <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
            {spielwieseSetupMomentContent.video.title}
          </p>
          <h2 className="max-w-[17ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Explain the reasoning, then let the interface breathe.
          </h2>
          <p className="max-w-[45ch] text-base text-pretty text-[rgba(23,23,23,0.7)]">
            {spielwieseSetupMomentContent.video.body}
          </p>
        </div>
        <div
          className="grid min-h-[26rem] place-items-center rounded-[32px] border border-[rgba(23,23,23,0.08)] bg-white p-6 shadow-[0_24px_60px_rgba(28,18,10,0.08)]"
          data-testid="spielwiese-intro-video-shell"
        >
          <div className="grid h-full w-full place-items-center rounded-[24px] border border-dashed border-[rgba(91,71,55,0.22)] bg-[rgba(250,245,239,0.72)]">
            <div className="grid gap-3 text-center">
              <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
                Video placeholder
              </p>
              <p className="mx-auto max-w-[24ch] text-lg font-semibold tracking-tight text-balance">
                Paste your walkthrough here when the recording is ready.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IntroClosingSection() {
  return (
    <section className="pt-14 pb-18 sm:pt-18 sm:pb-22">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-5 rounded-[32px] border border-[rgba(91,71,55,0.16)] bg-[rgba(255,249,242,0.94)] p-6 shadow-[0_24px_60px_rgba(28,18,10,0.08)] sm:p-8">
          <p className="font-mono text-[0.75rem] tracking-[0.16em] text-[rgba(91,71,55,0.68)] uppercase">
            Enter the flow
          </p>
          <h2 className="max-w-[18ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Move from thesis into product.
          </h2>
          <p className="max-w-[48ch] text-base text-pretty text-[rgba(23,23,23,0.68)]">
            {spielwieseSetupMomentContent.closing}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className={buttonVariants({
                className:
                  "h-10 rounded-full px-5 text-sm ring-1 ring-[rgba(91,71,55,0.18)]",
                size: "lg",
              })}
              href="/dev/spielwiese/onboarding"
            >
              Enter the setup flow
            </Link>
            <p className="text-sm text-[rgba(23,23,23,0.54)]">
              Product sign-up first, then the interactive setup screens.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SpielwieseIntroPage() {
  return (
    <div
      className="bg-background isolate min-h-dvh antialiased"
      data-spielwiese
      data-testid="spielwiese-intro-page"
    >
      <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(183,150,116,0.14),_transparent_38%),linear-gradient(180deg,_rgba(255,251,247,0.96),_rgba(255,255,255,1))]">
        <IntroHero />
        <IntroMomentsSection />
        <IntroArtifactsSection />
        <IntroVideoSection />
        <IntroClosingSection />
      </div>
    </div>
  );
}
