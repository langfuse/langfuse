import Link from "next/link";
import {
  Braces,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  FilePen,
  FlaskConical,
  ImagePlus,
  Lock,
  Users,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import {
  getGreenfieldOnboardingData,
  type GreenfieldPillar,
  type GreenfieldQuest,
  type GreenfieldTask,
} from "../lib/greenfieldOnboardingData";

type GreenfieldOnboardingViewProps = {
  firstName: string;
  projectId: string;
  organizationId?: string | null;
};

export function GreenfieldOnboardingView({
  firstName,
  projectId,
  organizationId,
}: GreenfieldOnboardingViewProps) {
  const data = getGreenfieldOnboardingData({ projectId, organizationId });

  return (
    <div className="flex min-h-full justify-center px-2 py-4 sm:px-4 sm:py-6">
      <div className="w-full max-w-[44rem] space-y-6">
        <header className="bg-background flex flex-wrap items-start justify-between gap-4 rounded-3xl border px-5 py-5 shadow-xs sm:px-6">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm font-medium">
              Greenfield onboarding
            </p>
            <h1 className="max-w-[18ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              You&apos;re on your way, {firstName}
            </h1>
            <p className="text-muted-foreground max-w-[54ch] text-base text-pretty">
              This is a source-inspired scaffold for the new onboarding flow. It
              preserves the structure of the reference while leaving the product
              logic easy to replace later.
            </p>
          </div>
          <div className="bg-muted/20 flex items-center gap-4 rounded-2xl border px-4 py-3">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm font-medium">
                Completion
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {data.completedTracks} of {data.totalTracks}
              </p>
            </div>
            <CircularProgress
              value={(data.completedTracks / data.totalTracks) * 100}
            />
          </div>
        </header>

        <div className="space-y-4">
          {data.pillars.map((pillar) => (
            <PillarSection key={pillar.id} pillar={pillar} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PillarSection({ pillar }: { pillar: GreenfieldPillar }) {
  const PillarIcon = getPillarIcon(pillar.id);
  const defaultOpenQuests = pillar.quests
    .filter((quest) => quest.defaultOpen)
    .map((quest) => quest.id);

  return (
    <section className="bg-muted/20 rounded-[1.75rem] border p-2.5">
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-2xl border",
              pillar.status === "active"
                ? "border-primary/15 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground",
            )}
          >
            <PillarIcon className="size-[1.125rem]" />
          </div>
          <div className="min-w-0">
            <h2
              className={cn(
                "text-lg font-semibold",
                pillar.status === "locked" && "text-muted-foreground",
              )}
            >
              {pillar.title}
            </h2>
            <p className="text-muted-foreground text-sm tabular-nums">
              {pillar.quests.length} quests
            </p>
          </div>
        </div>
        {pillar.status === "locked" ? (
          <div className="bg-background text-muted-foreground flex size-9 items-center justify-center rounded-xl">
            <Lock className="size-4" />
          </div>
        ) : null}
      </div>

      <Accordion
        type="multiple"
        defaultValue={defaultOpenQuests}
        className="space-y-2"
      >
        {pillar.quests.map((quest) =>
          quest.status === "locked" ? (
            <LockedQuestCard key={quest.id} quest={quest} />
          ) : (
            <QuestAccordionItem key={quest.id} quest={quest} />
          ),
        )}
      </Accordion>
    </section>
  );
}

function QuestAccordionItem({ quest }: { quest: GreenfieldQuest }) {
  const completedTasks = quest.tasks?.filter(
    (task) => task.status === "completed",
  ).length;
  const totalTasks = quest.tasks?.length ?? 0;

  return (
    <AccordionItem
      value={quest.id}
      className="bg-background overflow-hidden rounded-2xl border shadow-xs"
    >
      <AccordionTrigger className="[&>svg]:text-muted-foreground gap-4 px-4 py-4 hover:no-underline [&>svg]:mt-1">
        <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <QuestStatusIcon status="active" />
            <div className="min-w-0 space-y-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{quest.title}</h3>
              </div>
              <p className="text-muted-foreground max-w-[56ch] text-sm text-pretty">
                {quest.description}
              </p>
            </div>
          </div>
          <QuestStatusPill
            label={completedTasks === totalTasks ? "Done" : "In progress"}
            variant={completedTasks === totalTasks ? "complete" : "active"}
          />
        </div>
      </AccordionTrigger>

      <div className="px-4 pb-4">
        <SegmentedProgress
          completeCount={completedTasks ?? 0}
          totalCount={totalTasks}
        />
      </div>

      <AccordionContent className="px-4 pb-4">
        <ul role="list" className="space-y-2">
          {quest.tasks?.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}

function LockedQuestCard({ quest }: { quest: GreenfieldQuest }) {
  return (
    <div className="bg-background rounded-2xl border px-4 py-4 opacity-75 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <QuestStatusIcon status="locked" />
          <div className="min-w-0 space-y-1">
            <h3 className="text-muted-foreground text-base font-semibold">
              {quest.title}
            </h3>
            <p className="text-muted-foreground max-w-[56ch] text-sm text-pretty">
              {quest.description}
            </p>
          </div>
        </div>
        <QuestStatusPill label="Not started" variant="locked" />
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: GreenfieldTask }) {
  const isComplete = task.status === "completed";

  return (
    <li
      className={cn(
        "rounded-2xl border px-4 py-3",
        isComplete
          ? "border-border/60 bg-muted/20"
          : "border-primary/15 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CircleCheck className="text-primary size-4 shrink-0" />
            ) : (
              <CircleDashed className="text-primary size-4 shrink-0" />
            )}
            <p
              className={cn(
                "text-sm font-medium",
                isComplete && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </p>
          </div>
          {task.description ? (
            <p className="text-muted-foreground pl-6 text-sm text-pretty">
              {task.description}
            </p>
          ) : null}
        </div>
        {task.action ? (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="shrink-0 self-center"
          >
            {task.action.external ? (
              <a
                href={task.action.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {task.action.label}
                <ExternalLink className="ml-2 size-3.5" />
              </a>
            ) : (
              <Link href={task.action.href}>
                {task.action.label}
                <ChevronRight className="ml-2 size-3.5" />
              </Link>
            )}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function QuestStatusIcon({ status }: { status: "active" | "locked" }) {
  if (status === "locked") {
    return (
      <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-2xl">
        <Lock className="size-4" />
      </div>
    );
  }

  return (
    <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-2xl">
      <CircleDashed className="size-4" />
    </div>
  );
}

function QuestStatusPill({
  label,
  variant,
}: {
  label: string;
  variant: "active" | "complete" | "locked";
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap",
        variant === "active" && "bg-primary/10 text-primary",
        variant === "complete" && "bg-primary/10 text-primary",
        variant === "locked" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function SegmentedProgress({
  completeCount,
  totalCount,
}: {
  completeCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: totalCount }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            index < completeCount ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

function CircularProgress({ value }: { value: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.max(0, Math.min(100, value));
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <div className="relative flex size-12 items-center justify-center">
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        className="-rotate-90 transform"
      >
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke="currentColor"
          strokeWidth="5"
          fill="none"
          className="text-primary/10"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke="currentColor"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-primary transition-all duration-300"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {Math.round(clampedValue)}%
      </span>
    </div>
  );
}

function getPillarIcon(pillarId: GreenfieldPillar["id"]) {
  switch (pillarId) {
    case "iterate":
      return FilePen;
    case "evaluate":
      return FlaskConical;
    default:
      return FilePen;
  }
}

export const greenfieldReferenceGaps = [
  "The source artifact does not define a real quest or task schema, so this page uses typed mock data.",
  "Quest locking is visual only for now because no dependency graph or completion rules exist in the current codebase.",
  "Completion math is static at the summary level because the source does not expose how top-level progress should be derived.",
  "CTA destinations are partially inferred from existing Langfuse routes, not provided by the source itself.",
  "The original token system is absent from Langfuse, so the surface styling is translated into the repo's existing Tailwind theme.",
] as const;

export const greenfieldReferenceIcons = {
  images: ImagePlus,
  invite: Users,
  variables: Braces,
};
