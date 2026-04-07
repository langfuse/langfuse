export type GreenfieldTaskStatus = "completed" | "active";

export type GreenfieldTaskAction = {
  label: string;
  href: string;
  external?: boolean;
};

export type GreenfieldTask = {
  id: string;
  title: string;
  description?: string;
  status: GreenfieldTaskStatus;
  action?: GreenfieldTaskAction;
};

export type GreenfieldQuestStatus = "active" | "locked";

export type GreenfieldQuest = {
  id: string;
  title: string;
  description: string;
  status: GreenfieldQuestStatus;
  tasks?: GreenfieldTask[];
  defaultOpen?: boolean;
};

export type GreenfieldPillarStatus = "active" | "locked";

export type GreenfieldPillar = {
  id: string;
  title: string;
  status: GreenfieldPillarStatus;
  quests: GreenfieldQuest[];
};

export type GreenfieldOnboardingData = {
  completedTracks: number;
  totalTracks: number;
  pillars: GreenfieldPillar[];
};

// This is intentionally static for now.
// The source artifact provides the visual structure, but not the real
// quest model, dependency graph, completion rules, or final CTA routing.
export const getGreenfieldOnboardingData = ({
  projectId,
  organizationId,
}: {
  projectId: string;
  organizationId?: string | null;
}): GreenfieldOnboardingData => ({
  completedTracks: 0,
  totalTracks: 2,
  pillars: [
    {
      id: "iterate",
      title: "Iterate",
      status: "active",
      quests: [
        {
          id: "first-prompt",
          title: "Run your first Prompt",
          description:
            "Add a provider, choose a model, and run your first Prompt.",
          status: "active",
          defaultOpen: true,
          tasks: [
            {
              id: "choose-model",
              title: "Choose a model",
              status: "active",
            },
            {
              id: "write-prompt",
              title: "Write a simple prompt",
              status: "active",
            },
            {
              id: "run-playground",
              title: "Run it in the Playground",
              description:
                "Test the prompt against a real model response and refine the output before you wire anything deeper into the app.",
              status: "active",
              action: {
                label: "Open Playground",
                href: `/project/${projectId}/playground`,
              },
            },
          ],
        },
        {
          id: "images",
          title: "Add images to your Prompt",
          description: "Use images as inputs to your prompt.",
          status: "locked",
        },
        {
          id: "variables",
          title: "Add Prompt Variables",
          description: "Make your prompt dynamic with variables.",
          status: "locked",
        },
        {
          id: "invite-engineer",
          title: "Invite an engineer",
          description: "Collaborate with your team before you scale the flow.",
          status: "active",
          tasks: [
            {
              id: "invite-member",
              title: "Invite a teammate",
              description:
                "Bring in one engineer so the prompt, tracing, and evaluation workflow can be reviewed together.",
              status: "active",
              ...(organizationId
                ? {
                    action: {
                      label: "Open Members",
                      href: `/organization/${organizationId}/settings/members`,
                    },
                  }
                : {}),
            },
          ],
        },
      ],
    },
    {
      id: "evaluate",
      title: "Evaluate",
      status: "locked",
      quests: [
        {
          id: "datasets",
          title: "Build your first dataset",
          description: "Collect representative examples before you evaluate.",
          status: "locked",
        },
        {
          id: "scores",
          title: "Define score criteria",
          description: "Choose what quality means for this workflow.",
          status: "locked",
        },
        {
          id: "runs",
          title: "Run a first evaluation",
          description:
            "Execute the prompt against examples and inspect output.",
          status: "locked",
        },
        {
          id: "compare",
          title: "Compare prompt revisions",
          description: "Use evaluation results to decide what to keep.",
          status: "locked",
        },
      ],
    },
  ],
});
