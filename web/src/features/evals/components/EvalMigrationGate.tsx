import { useRouter } from "next/router";
import { type ComponentType, type ReactNode } from "react";

import { AskAgentButton } from "@/src/components/AskAgentButton";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { useEvalMigrationCohort } from "@/src/features/evals/hooks/useEvalMigrationCohort";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

const EVAL_MIGRATION_PROMPT = `I want to migrate my trace-level evaluators to span-level evaluators.

Please:
1. List my active evaluation rules that target traces.
2. For each one, propose a span-level replacement: same evaluator template, targeting the span that holds the evaluated input and output.
3. After I approve a proposal, create the new span-level evaluation rule and pause the trace-level one.

Walk me through one evaluator at a time.`;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{question}</p>
      <p className="text-muted-foreground text-sm">{answer}</p>
    </div>
  );
}

/**
 * Blocks the evals UI for projects in migration cohort C3a (LFE-10414): the
 * page stays visible behind a 50% veil, all interaction underneath is
 * disabled (`inert`), and a card offers the agent-assisted upgrade. The
 * `isolate` on the content wrapper traps the page header's z-index in its own
 * stacking context so the veil wins by DOM order, without any z-index here.
 */
export function EvalMigrationGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;
  const { cohort } = useEvalMigrationCohort(projectId);
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();

  if (!projectId || cohort !== "C3a") {
    return <>{children}</>;
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <div inert className="isolate flex min-h-0 w-full flex-1 flex-col">
        {children}
      </div>
      <div className="bg-background/80 absolute inset-0 flex items-center justify-center p-4">
        <Card className="flex max-w-xl flex-col gap-4 p-6 shadow-lg">
          <div>
            <h2 className="text-lg font-semibold">
              Evals are moving to observation-level
            </h2>
            <p className="text-muted-foreground text-sm">
              Don&apos;t worry — your evaluators are still running.
            </p>
          </div>
          <FaqItem
            question="What happened?"
            answer="We moved to a new evaluation engine that runs on observations. It's real-time, and scales better."
          />
          <FaqItem
            question="What do I need to do?"
            answer="Upgrade your evaluators to our new observation-level evaluators. The AI assistant can do this with you — it asks for your approval before changing anything."
          />
          <FaqItem
            question="Do I have to do it now?"
            answer="Yes. New evaluators can no longer be created, and existing ones cannot be modified."
          />
          <FaqItem
            question="What happens if I don't?"
            answer="Your evaluators keep running, but they are no longer actively maintained."
          />
          <div className="flex gap-2">
            <AskAgentButton prompt={EVAL_MIGRATION_PROMPT}>
              Start upgrade
            </AskAgentButton>
            <Button
              variant="outline"
              onClick={() => setSupportDrawerOpen(true)}
            >
              Reach out to support
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function withEvalMigrationGate<P extends object>(
  PageComponent: ComponentType<P>,
) {
  const GatedPage = (props: P) => (
    <EvalMigrationGate>
      <PageComponent {...props} />
    </EvalMigrationGate>
  );
  GatedPage.displayName = `withEvalMigrationGate(${
    PageComponent.displayName ?? PageComponent.name ?? "Page"
  })`;
  return GatedPage;
}
