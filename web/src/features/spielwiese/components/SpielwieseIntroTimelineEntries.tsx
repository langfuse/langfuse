import type { SpielwieseIntroTimelineEntry } from "./spielwieseSetupMomentContent";

const timelineLinkClassName =
  "border-b border-[rgba(0,0,0,0.18)] pb-[0.05rem] text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.46)] transition-[color,border-color] duration-150 hover:border-[rgba(0,0,0,0.32)] hover:text-[rgba(0,0,0,0.68)]";
const timelineDetailsTriggerTextClassName =
  "border-b border-[rgba(0,0,0,0.18)] pb-[0.05rem] text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(0,0,0,0.46)] transition-[color,border-color] duration-150 group-hover/timeline-trigger:border-[rgba(0,0,0,0.32)] group-hover/timeline-trigger:text-[rgba(0,0,0,0.68)]";

function TimelineDetailsTrigger({ detailsLabel }: { detailsLabel: string }) {
  return (
    <summary
      className="group/timeline-trigger cursor-pointer list-none [&::-webkit-details-marker]:hidden"
      data-testid="spielwiese-intro-timeline-details-trigger"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className={timelineDetailsTriggerTextClassName}>
          {detailsLabel}
        </span>
        <svg
          aria-hidden="true"
          className="size-[0.625rem] -rotate-90 text-[rgba(0,0,0,0.32)] transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-open/timeline:rotate-0 group-hover/timeline-trigger:text-[rgba(0,0,0,0.68)]"
          data-testid="spielwiese-intro-timeline-details-chevron"
          fill="none"
          viewBox="0 0 10 10"
        >
          <path
            d="M2.25 3.75 5 6.5l2.75-2.75"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.1"
          />
        </svg>
      </span>
    </summary>
  );
}

function TimelineEntryRow({ entry }: { entry: SpielwieseIntroTimelineEntry }) {
  return (
    <div
      className="grid gap-0 pb-4 last:pb-0"
      data-testid={`spielwiese-intro-timeline-item-${entry.date.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      key={entry.date}
    >
      <div className="flex max-w-[66ch] flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-sm/5 font-[460] tracking-[-0.0056rem] text-[rgba(17,17,17,1)]">
          {entry.date}
        </p>
        <a
          aria-label={`loc for ${entry.date}`}
          className={timelineLinkClassName}
          href={entry.repoHref}
          rel="noreferrer"
          target="_blank"
        >
          {entry.meta}
        </a>
      </div>
      <p className="max-w-[66ch] text-sm/5 font-[460] tracking-[-0.0056rem] text-pretty text-[rgba(17,17,17,1)]">
        {entry.summary}
      </p>
    </div>
  );
}

export function SpielwieseIntroTimelineEntries({
  detailsLabel,
  entries,
  tldr,
}: {
  detailsLabel: string;
  entries: readonly SpielwieseIntroTimelineEntry[];
  tldr: string;
}) {
  return (
    <div className="grid gap-0">
      <p className="max-w-[66ch] text-sm/5 font-[460] tracking-[-0.0056rem] text-pretty text-[rgba(17,17,17,1)]">
        {tldr}
      </p>
      <details
        className="group/timeline mt-3 grid gap-0"
        data-testid="spielwiese-intro-timeline-details"
      >
        <TimelineDetailsTrigger detailsLabel={detailsLabel} />
        <div className="pt-4">
          <div
            className="grid gap-0"
            data-testid="spielwiese-intro-timeline-items"
          >
            {entries.map((entry) => (
              <TimelineEntryRow entry={entry} key={entry.date} />
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
