import Link from "next/link";
import { ChevronRight, Github, Plus, Slack, Webhook } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import { Button } from "@/src/components/ui/button";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { automationCreateHref } from "@/src/features/automations/components/automationForm";
import { type ActionTypes } from "@langfuse/shared";

/** OnboardingChannel describes one notification-channel CTA shown in step 1 of the splash. */
type OnboardingChannel = {
  actionType: ActionTypes;
  label: string;
  icon: React.ReactNode;
};

/** channels enumerates the three notification channels presented to a first-time user. */
const channels: OnboardingChannel[] = [
  {
    actionType: "SLACK",
    label: "Connect Slack",
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- brand icon retained for parity with MonitorAutomationsPanel.
    icon: <Slack className="h-4 w-4" aria-hidden="true" />,
  },
  {
    actionType: "WEBHOOK",
    label: "Connect Webhooks",
    icon: <Webhook className="h-4 w-4" aria-hidden="true" />,
  },
  {
    actionType: "GITHUB_DISPATCH",
    label: "Connect Github Actions",
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see Slack note above.
    icon: <Github className="h-4 w-4" aria-hidden="true" />,
  },
];

/** MonitorsOnboarding renders the splash shown on /monitors when the project has no monitors yet. */
export function MonitorsOnboarding({
  projectId,
  hasCUDAccess,
}: {
  projectId: string;
  hasCUDAccess: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-xl pt-12">
      <SplashScreen
        title="Catch issues before they impact your users"
        description="Get notified when cost, quality, latency, or other key metrics move outside of expected ranges."
        steps={[
          {
            title: "Choose where alerts should go",
            description:
              "Send alerts to Slack, Webhooks, or GitHub Actions so your team and your workflows can respond automatically.",
            content: (
              <div className="flex flex-col gap-2">
                {channels.map((channel) => (
                  <Button
                    key={channel.actionType}
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full justify-between gap-2 px-6 py-5"
                  >
                    <Link
                      href={automationCreateHref(
                        projectId,
                        channel.actionType,
                        `/project/${projectId}/monitors`,
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {channel.icon}
                        {channel.label}
                      </span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ))}
              </div>
            ),
          },
          {
            title: "Decide what to monitor",
            description:
              "Create monitors for sudden cost spikes, quality drops, latency changes, or other important changes.",
            content: (
              <ActionButton
                hasAccess={hasCUDAccess}
                icon={<Plus className="h-4 w-4" aria-hidden="true" />}
                href={`/project/${projectId}/monitors/new`}
                variant="default"
                size="lg"
              >
                Create Monitor
              </ActionButton>
            ),
          },
        ]}
      />
    </div>
  );
}
