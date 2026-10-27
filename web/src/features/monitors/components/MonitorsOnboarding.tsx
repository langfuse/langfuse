/* eslint-disable @typescript-eslint/no-use-before-define */
import Link from "next/link";
import { Github, Plus, Slack, Webhook } from "@langfuse/icons";
import { SiPagerduty } from "@langfuse/icons/si";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";

import { ActionButton } from "@/src/components/ActionButton";
import { Button } from "@/src/components/ui/button";
import { SplashScreen } from "@/src/components/ui/SplashScreen";
import {
  automationCreateHref,
  availableActionTypes,
  isInternalActionType,
} from "@/src/features/automations";
import {
  InternalFeatureBadge,
  useInternalFeaturesEnabled,
} from "@/src/features/feature-flags";
import { type ActionTypes } from "@langfuse/shared";

/** OnboardingChannel describes one notification-channel CTA shown in step 1 of the splash. */
type OnboardingChannel = {
  actionType: ActionTypes;
  label: string;
  icon: React.ReactNode;
};

/** channels enumerates the notification channels presented to a first-time user. */
const channels: OnboardingChannel[] = [
  {
    actionType: "SLACK",
    label: "Connect Slack",
    icon: <Slack size="base" aria-hidden="true" />,
  },
  {
    actionType: "WEBHOOK",
    label: "Connect Webhooks",
    icon: <Webhook size="base" aria-hidden="true" />,
  },
  {
    actionType: "GITHUB_DISPATCH",
    label: "Connect Github Actions",
    icon: <Github size="base" aria-hidden="true" />,
  },
  {
    actionType: "PAGERDUTY",
    label: "Connect PagerDuty",
    icon: <SiPagerduty size="base" aria-hidden="true" />,
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
  const internalFeaturesEnabled = useInternalFeaturesEnabled();

  return (
    <div className="mx-auto w-full max-w-xl pt-12">
      <SplashScreen
        title="Catch issues before they impact your users"
        description="Get notified when cost, quality, latency, or other key metrics move outside of expected ranges."
        steps={[
          {
            title: "Choose where alerts should go",
            description: channelsDescription(internalFeaturesEnabled),
            content: (
              <div className="flex flex-col gap-2">
                {visibleChannels(internalFeaturesEnabled).map((channel) => (
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
                        {channel.label}
                        {isInternalActionType(channel.actionType) && (
                          <InternalFeatureBadge />
                        )}
                      </span>
                      <DropdownIndicator direction="right" />
                    </Link>
                  </Button>
                ))}
              </div>
            ),
          },
          {
            title: "Decide what to monitor",
            description:
              "Create alerts for sudden cost spikes, quality drops, latency changes, or other important changes.",
            content: (
              <ActionButton
                hasAccess={hasCUDAccess}
                icon={<Plus size="base" aria-hidden="true" />}
                href={`/project/${projectId}/alerts/new`}
                variant="default"
                size="lg"
              >
                Create Alert
              </ActionButton>
            ),
          },
        ]}
      />
    </div>
  );
}

/** visibleChannels drops channels whose action type is limited to internal view. */
function visibleChannels(
  internalFeaturesEnabled: boolean,
): OnboardingChannel[] {
  const actionTypes = availableActionTypes(
    channels.map((channel) => channel.actionType),
    internalFeaturesEnabled,
  );
  return channels.filter((channel) => actionTypes.includes(channel.actionType));
}

/** channelsDescription names the channels the user can connect. */
function channelsDescription(internalFeaturesEnabled: boolean): string {
  if (internalFeaturesEnabled) {
    return "Send alerts to Slack, Webhooks, GitHub Actions, or PagerDuty so your team and your workflows can respond automatically.";
  }
  return "Send alerts to Slack, Webhooks, or GitHub Actions so your team and your workflows can respond automatically.";
}
