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
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import {
  getGreenfieldOnboardingData,
  type GreenfieldPillar,
  type GreenfieldQuest,
  type GreenfieldTask,
} from "../lib/greenfieldOnboardingData";

type GreenfieldOnboardingViewProps = {
  projectId: string;
  organizationId?: string | null;
};

export function GreenfieldOnboardingView({
  projectId,
  organizationId,
}: GreenfieldOnboardingViewProps) {
  const data = getGreenfieldOnboardingData({ projectId, organizationId });
  const defaultOpenPillars = data.pillars
    .filter((pillar) => pillar.status === "active")
    .map((pillar) => pillar.id);

  return (
    <div className="w-full py-3">
      <div className="mx-auto w-full max-w-screen-xl px-12 sm:px-16 lg:px-24">
        <Accordion
          type="multiple"
          defaultValue={defaultOpenPillars}
          className="space-y-3"
        >
          {data.pillars.map((pillar) => (
            <PillarSection key={pillar.id} pillar={pillar} />
          ))}
        </Accordion>
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
    <AccordionItem
      value={pillar.id}
      className={cn(
        "bg-card overflow-hidden rounded-lg border shadow-xs",
        pillar.status === "locked" && "bg-muted/10",
      )}
    >
      <AccordionTrigger className="[&>svg]:text-muted-foreground gap-4 px-4 py-4 hover:no-underline [&>svg]:mr-1">
        <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-md border",
                pillar.status === "active"
                  ? "border-primary/15 bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground border-transparent",
              )}
            >
              <PillarIcon className="size-[1.125rem]" />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{pillar.title}</h2>
                <Badge
                  variant={
                    pillar.status === "locked" ? "outline-solid" : "secondary"
                  }
                >
                  {pillar.status === "locked" ? "Locked" : "Not started"}
                </Badge>
              </div>
              <p className="text-muted-foreground max-w-[52ch] text-sm text-pretty">
                {getPillarDescription(pillar.id)}
              </p>
            </div>
          </div>
          <Badge variant="outline-solid">{pillar.quests.length} quests</Badge>
        </div>
      </AccordionTrigger>

      <AccordionContent className="border-t px-4 pt-4 pb-4">
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
