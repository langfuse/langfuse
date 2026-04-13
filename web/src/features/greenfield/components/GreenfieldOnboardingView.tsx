import Link from "next/link";
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  FilePen,
  FlaskConical,
  Lock,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import {
  getGreenfieldOnboardingData,
  type GreenfieldOnboardingData,
  type GreenfieldPillar,
  type GreenfieldQuest,
  type GreenfieldTask,
} from "../lib/greenfieldOnboardingData";

type GreenfieldOnboardingViewProps = {
  projectId: string;
  organizationId?: string | null;
  iterateHref?: string;
  iterateLabel?: string;
};

export function GreenfieldOnboardingView({
  projectId,
  organizationId,
  iterateHref,
  iterateLabel,
}: GreenfieldOnboardingViewProps) {
  const data = getGreenfieldOnboardingData({
    projectId,
    organizationId,
    iterateHref,
    iterateLabel,
  });
  const defaultOpenPillars = data.pillars
    .filter((pillar) => pillar.status === "active")
    .map((pillar) => pillar.id);

  return (
    <div className="w-full py-4">
      <div className="mx-auto w-full max-w-[90rem] px-4 sm:px-8 xl:px-10">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <GreenfieldSidebar data={data} />

          <Accordion
            type="multiple"
            defaultValue={defaultOpenPillars}
            className="space-y-4"
          >
            {data.pillars.map((pillar, index) => (
              <PillarSection key={pillar.id} pillar={pillar} index={index} />
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}

function GreenfieldSidebar({ data }: { data: GreenfieldOnboardingData }) {
  const activePillar =
    data.pillars.find((pillar) => pillar.status === "active") ??
    data.pillars[0];
  const totalQuests = data.pillars.reduce(
    (count, pillar) => count + pillar.quests.length,
    0,
  );

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="border-border/60 bg-background overflow-hidden rounded-[1.75rem] border">
        <div className="border-border/60 border-b px-5 pt-5 pb-4">
          <p className="text-muted-foreground text-sm font-medium">
            Greenfield onboarding
          </p>
          <h1 className="mt-2 max-w-[14ch] text-2xl font-semibold tracking-tight text-balance">
            Stand up a reliable prompt workflow
          </h1>
          <p className="text-muted-foreground mt-3 max-w-[30ch] text-base text-pretty sm:text-sm">
            Start with one high-signal prompt loop, then unlock evaluation once
            the workflow is moving.
          </p>
        </div>

        <dl className="grid grid-cols-2 px-5 py-4">
          <div className="pr-4">
            <dt className="text-muted-foreground text-sm font-medium">
              Tracks live
            </dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {data.completedTracks}/{data.totalTracks}
            </dd>
          </div>
          <div className="border-border/60 border-l pl-4">
            <dt className="text-muted-foreground text-sm font-medium">
              Active now
            </dt>
            <dd className="mt-1 max-w-[12ch] text-base font-medium text-pretty">
              {activePillar?.title ?? "No active track"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-border/60 bg-background mt-4 overflow-hidden rounded-[1.5rem] border">
        <div className="border-border/60 border-b px-5 py-4">
          <p className="text-base font-medium sm:text-sm">Track map</p>
          <p className="text-muted-foreground mt-1 text-base text-pretty sm:text-sm">
            Move through each pillar in order. Locked work opens once the
            earlier steps are in motion.
          </p>
        </div>

        <div className="space-y-1.5 p-2">
          {data.pillars.map((pillar, index) => (
            <SidebarPillarLink
              key={pillar.id}
              pillar={pillar}
              index={index}
              isCurrent={pillar.id === activePillar?.id}
            />
          ))}
        </div>

        <div className="border-border/60 border-t px-5 py-4">
          <p className="text-muted-foreground text-sm font-medium">
            Quest coverage
          </p>
          <p className="mt-1 text-base font-medium tabular-nums">
            {totalQuests} quests across {data.totalTracks} tracks
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarPillarLink({
  pillar,
  index,
  isCurrent,
}: {
  pillar: GreenfieldPillar;
  index: number;
  isCurrent: boolean;
}) {
  const PillarIcon = getPillarIcon(pillar.id);
  const activeQuestCount = pillar.quests.filter(
    (quest) => quest.status === "active",
  ).length;

  return (
    <Link
      href={`#pillar-${pillar.id}`}
      className={cn(
        "group flex items-start gap-3 rounded-[1.25rem] px-3 py-3 transition-colors",
        isCurrent
          ? "bg-primary/6 ring-primary/15 ring-1 ring-inset"
          : "hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl border",
          pillar.status === "locked"
            ? "border-border/60 bg-muted/40 text-muted-foreground"
            : isCurrent
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-border/60 bg-background text-foreground",
        )}
      >
        {pillar.status === "locked" ? (
          <span className="text-sm font-medium tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
        ) : (
          <PillarIcon className="size-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-medium sm:text-sm">{pillar.title}</p>
          <Badge
            variant={
              pillar.status === "locked"
                ? "outline-solid"
                : isCurrent
                  ? "secondary"
                  : "outline-solid"
            }
            className="rounded-full px-2.5 py-0.5 text-[11px]"
          >
            {pillar.status === "locked"
              ? "Locked"
              : isCurrent
                ? "Active"
                : "Ready"}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-base text-pretty sm:text-sm">
          {getPillarDescription(pillar.id)}
        </p>
        <p className="text-muted-foreground mt-2 text-sm tabular-nums">
          {activeQuestCount} active quest{activeQuestCount === 1 ? "" : "s"} ·{" "}
          {pillar.quests.length} total
        </p>
      </div>
    </Link>
  );
}

function PillarSection({
  pillar,
  index,
}: {
  pillar: GreenfieldPillar;
  index: number;
}) {
  const PillarIcon = getPillarIcon(pillar.id);
  const defaultOpenQuests = pillar.quests
    .filter((quest) => quest.defaultOpen)
    .map((quest) => quest.id);

  return (
    <AccordionItem
      value={pillar.id}
      id={`pillar-${pillar.id}`}
      className={cn(
        "bg-card border-border/60 scroll-mt-6 overflow-hidden rounded-[1.75rem] border shadow-xs",
        pillar.status === "locked" && "bg-muted/10",
      )}
    >
      <AccordionTrigger className="[&>svg]:text-muted-foreground gap-4 px-5 py-5 hover:no-underline [&>svg]:mr-1">
        <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl border",
                pillar.status === "active"
                  ? "border-primary/15 bg-primary/10 text-primary"
                  : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              <PillarIcon className="size-[1.125rem]" />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-muted-foreground text-sm font-medium tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2 className="text-base font-semibold sm:text-lg">
                  {pillar.title}
                </h2>
                <Badge
                  variant={
                    pillar.status === "locked" ? "outline-solid" : "secondary"
                  }
                >
                  {pillar.status === "locked" ? "Locked" : "Ready to start"}
                </Badge>
              </div>
              <p className="text-muted-foreground max-w-[52ch] text-base text-pretty sm:text-sm">
                {getPillarDescription(pillar.id)}
              </p>
            </div>
          </div>
          <Badge variant="outline-solid" className="tabular-nums">
            {pillar.quests.length} quests
          </Badge>
        </div>
      </AccordionTrigger>

      <AccordionContent className="border-border/60 border-t px-5 pt-4 pb-5">
        <Accordion
          type="multiple"
          defaultValue={defaultOpenQuests}
          className="space-y-3"
        >
          {pillar.quests.map((quest) =>
            quest.status === "locked" ? (
              <LockedQuestCard key={quest.id} quest={quest} />
            ) : (
              <QuestAccordionItem key={quest.id} quest={quest} />
            ),
          )}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

function QuestAccordionItem({ quest }: { quest: GreenfieldQuest }) {
  const completedTasks = quest.tasks?.filter(
    (task) => task.status === "completed",
  ).length;
  const totalTasks = quest.tasks?.length ?? 0;
  const questState =
    completedTasks === totalTasks && totalTasks > 0
      ? "complete"
      : completedTasks > 0
        ? "active"
        : "not-started";

  return (
    <AccordionItem
      value={quest.id}
      className="bg-background overflow-hidden rounded-lg border px-0 shadow-xs"
    >
      <AccordionTrigger className="[&>svg]:text-muted-foreground gap-4 px-4 py-4 hover:no-underline [&>svg]:mt-1 [&>svg]:mr-1">
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
          <QuestStatusPill state={questState} />
        </div>
      </AccordionTrigger>

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
    <div className="bg-background rounded-lg border px-4 py-4 opacity-75 shadow-xs">
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
        <QuestStatusPill state="locked" />
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: GreenfieldTask }) {
  const isComplete = task.status === "completed";

  return (
    <li
      className={cn(
        "rounded-lg border px-4 py-3",
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
      <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
        <Lock className="size-4" />
      </div>
    );
  }

  return (
    <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md">
      <CircleDashed className="size-4" />
    </div>
  );
}

function QuestStatusPill({
  state,
}: {
  state: "active" | "complete" | "not-started" | "locked";
}) {
  const config = {
    active: { label: "In progress", variant: "warning" as const },
    complete: { label: "Done", variant: "success" as const },
    "not-started": { label: "Not started", variant: "outline-solid" as const },
    locked: { label: "Locked", variant: "outline-solid" as const },
  }[state];

  return (
    <Badge
      variant={config.variant}
      className="rounded-full px-3 py-1 text-[11px]"
    >
      {config.label}
    </Badge>
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

function getPillarDescription(pillarId: GreenfieldPillar["id"]) {
  switch (pillarId) {
    case "iterate":
      return "Set up the first prompt workflow and bring the right people into it.";
    case "evaluate":
      return "Add the dataset and quality loop once the prompt flow is in motion.";
    default:
      return "Complete the next onboarding steps.";
  }
}
