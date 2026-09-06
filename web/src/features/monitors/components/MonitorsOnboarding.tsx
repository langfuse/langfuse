import Link from "next/link";
import { ChevronRight, Github, Plus, Slack, Webhook } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import { Button } from "@/src/components/ui/button";
import { SplashScreen } from "@/src/components/ui/splash-screen";
import { automationCreateHref } from "@/src/features/automations/components/automationForm";
import { type ActionTypes } from "@langfuse/shared";
import { useTranslations } from "next-intl";

/** OnboardingChannel describes one notification-channel CTA shown in step 1 of the splash. */
type OnboardingChannel = {
  actionType: ActionTypes;
  labelKey: "connectSlack" | "connectWebhooks" | "connectGithub";
  icon: React.ReactNode;
};

/** channels enumerates the three notification channels presented to a first-time user. */
const channels: OnboardingChannel[] = [
  {
    actionType: "SLACK",
    labelKey: "connectSlack",
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- brand icon retained for parity with MonitorAutomationsPanel.
    icon: <Slack className="h-4 w-4" aria-hidden="true" />,
  },
  {
    actionType: "WEBHOOK",
    labelKey: "connectWebhooks",
    icon: <Webhook className="h-4 w-4" aria-hidden="true" />,
  },
  {
    actionType: "GITHUB_DISPATCH",
    labelKey: "connectGithub",
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
  const t = useTranslations("operationsUi.monitors.onboarding");

  return (
    <div className="mx-auto w-full max-w-xl pt-12">
      <SplashScreen
        title={t("title")}
        description={t("description")}
        steps={[
          {
            title: t("channelsTitle"),
            description: t("channelsDescription"),
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
                        `/project/${projectId}/alerts`,
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {channel.icon}
                        {t(channel.labelKey)}
                      </span>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ))}
              </div>
            ),
          },
          {
            title: t("monitorTitle"),
            description: t("monitorDescription"),
            content: (
              <ActionButton
                hasAccess={hasCUDAccess}
                icon={<Plus className="h-4 w-4" aria-hidden="true" />}
                href={`/project/${projectId}/alerts/new`}
                variant="default"
                size="lg"
              >
                {t("createAlert")}
              </ActionButton>
            ),
          },
        ]}
      />
    </div>
  );
}
