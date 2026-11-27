import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/SplashScreen";
import {
  ClipboardCheck,
  Users,
  BarChart4,
  GitMerge,
  PlusIcon,
} from "@langfuse/icons";
import { type ComponentProps } from "react";
import { ActionButton } from "@/src/components/ActionButton";
import { CreateProjectMemberDialogController } from "@/src/features/rbac/components/CreateProjectMemberDialogController";

export function AnnotationQueuesOnboarding({
  disabled,
  usageLimit,
  onClick,
}: {
  disabled: { reason: string } | undefined;
  usageLimit: ComponentProps<typeof ActionButton>["usageLimit"];
  onClick: () => void;
}) {
  const getValuePropositions = (
    openInviteDialog: (() => void) | undefined,
  ): ValueProposition[] => [
    {
      title: "Manage scoring workflows",
      description:
        "Create and manage annotation queues to streamline your scoring workflows",
      icon: ClipboardCheck,
    },
    {
      title: "Collaborate with annotators",
      description:
        "Invite team members to annotate and evaluate your LLM outputs.",
      action: openInviteDialog && {
        label: "Invite teammates",
        onClick: openInviteDialog,
      },
      icon: Users,
    },
    {
      title: "Track annotation metrics",
      description:
        "Monitor annotation progress and quality metrics across your team",
      icon: BarChart4,
    },
    {
      title: "Baseline evaluation efforts",
      description:
        "Use annotation data as a baseline to evaluate your other evaluation metrics",
      icon: GitMerge,
    },
  ];

  return (
    <CreateProjectMemberDialogController surface="annotation_queues_empty_state">
      {({ hasAccess: canInvite, openDialog: openInviteDialog }) => (
        <SplashScreen
          title="Get Started with Annotation Queues"
          description="Annotation queues help you manage manual annotation/labeling for your LLM projects. Create queues, define annotation metrics, and track progress."
          valuePropositions={getValuePropositions(
            canInvite ? openInviteDialog : undefined,
          )}
          primaryAction={{
            label: "Create Annotation Queue",
            component: (
              <ActionButton
                variant="default"
                hasAccess={!disabled}
                usageLimit={usageLimit}
                onClick={onClick}
                icon={<PlusIcon size="base" aria-hidden="true" />}
                size="lg"
              >
                <span className="ml-1 text-sm font-normal">New queue</span>
              </ActionButton>
            ),
          }}
          secondaryAction={{
            label: "Learn More",
            href: "https://langfuse.com/docs/scores/annotation",
          }}
          videoSrc="https://static.langfuse.com/prod-assets/onboarding/annotation-queue-overview-v1.mp4"
        />
      )}
    </CreateProjectMemberDialogController>
  );
}
