import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import useLocalStorage from "../useLocalStorage";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import ProductHuntBadgeLight from "../images/product_hunt_badge_light.svg";
import ProductHuntBadgeDark from "../images/product_hunt_badge_dark.svg";
import Image from "next/image";

const NOTIFICATION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // two weeks

type SidebarNotification = {
  id: string; // Add unique ID for each notification
  title: string;
  description: React.ReactNode;
  createdAt?: string; // optional, used to expire the notification
  link?: string;
  // defaults to "Learn more" if no linkContent and no linkTitle
  linkTitle?: string;
  linkContent?: React.ReactNode;
};

const notifications: SidebarNotification[] = [
  {
    id: "lw4-1",
    title: "Launch Week 4: Day 1",
    description:
      "New Filters for Tables and Public API to query Traces and Observations.",
    link: "https://langfuse.com/blog/2025-10-29-launch-week-4",
    linkTitle: "Learn more",
    createdAt: "2025-11-03",
  },
  {
    id: "lw4-2",
    title: "Launch Week 4: Day 2",
    description:
      "Collaborate with your team in Langfuse with @mentions & emoji reactions for comments.",
    link: "https://langfuse.com/changelog/2025-11-04-comment-mentions-and-reactions",
    linkTitle: "Learn more",
    createdAt: "2025-11-04",
  },
  {
    id: "lw4-3",
    title: "Launch Week 4: Day 3",
    description:
      "Available and used LLM tools are rendered in the UI for debugging. Log view & agent graphs GA.",
    link: "https://langfuse.com/changelog/2025-11-05-langfuse-for-agents",
    linkTitle: "Learn more",
    createdAt: "2025-11-05",
  },
  {
    id: "lw4-4",
    title: "Launch Week 4: Day 4",
    description:
      "New for Experiments: Annotations in the compare view, set a Baseline to view score differences, and filters for outliers",
    link: "https://langfuse.com/blog/2025-10-29-launch-week-4#day-4-experiments-in-langfuse",
    linkTitle: "Learn more",
    createdAt: "2025-11-06",
  },
  {
    id: "js-sdk-v4",
    title: "New JS/TS SDK v4",
    description:
      "With v4, the TypeScript SDK significantly improves DX, speed, and ecosystem integrations.",
    link: "https://langfuse.com/docs/observability/sdk/typescript/overview",
    linkTitle: "Learn more",
    createdAt: "2025-09-09",
  },
  {
    id: "python-sdk-v3",
    title: "New Python SDK v3",
    description:
      "Python SDK V3 offers significant improvements in developer experience, performance, and integrations.",
    link: "https://langfuse.com/docs/observability/sdk/python/upgrade-path",
    linkTitle: "Upgrade to v3",
    createdAt: "2025-06-27",
  },
  {
    id: "lw3-5",
    title: "Launch Week #3: Day 5",
    description: "New OpenTelemetry based Python SDK.",
    link: "https://langfuse.com/changelog/2025-05-23-otel-based-python-sdk",
    linkTitle: "Learn more",
    createdAt: "2025-05-23",
  },
  {
    id: "lw3-4",
    title: "Launch Week #3: Day 4",
    description: "Terraform Modules for AWS, Azure and GCP.",
    link: "https://langfuse.com/changelog/2025-05-22-terraform-modules",
    linkTitle: "Learn more",
    createdAt: "2025-05-22",
  },
  {
    id: "lw3-3-producthunt",
    title: "Launch Week #3: Day 3",
    createdAt: "2025-05-21",
    description: (
      <span>
        We are launching <strong>Custom Dashboards</strong> on Product Hunt
        today.
        <br />
        Support the launch to help grow the community!
      </span>
    ),
    link: "https://langfuse.com/ph",
    linkTitle: "Product Hunt",
    linkContent: (
      <>
        <Image
          src={ProductHuntBadgeDark}
          alt="Product Hunt"
          width={160}
          className="mt-1 hidden dark:block"
        />
        <Image
          src={ProductHuntBadgeLight}
          alt="Product Hunt"
          width={160}
          className="mt-1 dark:hidden"
        />
      </>
    ),
  },
  {
    id: "lw3-2",
    title: "Launch Week #3: Day 2",
    description:
      "Saved table views let you reopen any filtered table view with one click.",
    link: "https://langfuse.com/blog/2025-05-19-launch-week-3",
    linkTitle: "Learn more",
    createdAt: "2025-05-20",
  },
  {
    id: "lw3-1",
    title: "Launch Week #3: Day 1",
    description: "New full text search for trace and observation input/output.",
    link: "https://langfuse.com/blog/2025-05-19-launch-week-3",
    linkTitle: "Learn more",
    createdAt: "2025-05-19",
  },
  {
    id: "github-star",
    title: "Star Langfuse",
    description:
      "See the latest releases and help grow the community on GitHub",
    link: "https://github.com/langfuse/langfuse",
    linkContent: (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt="Langfuse GitHub stars"
        src="https://img.shields.io/github/stars/langfuse/langfuse?label=langfuse&amp;style=social"
      />
    ),
  },
];

const STORAGE_KEY = "dismissed-sidebar-notifications";

export function SidebarNotifications() {
  const capture = usePostHogClientCapture();
  const [currentNotificationIndex, setCurrentNotificationIndex] = useState<
    number | null
  >(null);

  const [dismissedNotifications, setDismissedNotifications] = useLocalStorage<
    string[]
  >(STORAGE_KEY, []);

  const isExpired = (notif: SidebarNotification) => {
    if (!notif.createdAt) return false;
    const created = new Date(notif.createdAt).getTime();
    return Date.now() > created + NOTIFICATION_TTL_MS;
  };

  // Find the oldest non-dismissed notification on mount or when dismissed list changes
  useEffect(() => {
    const firstAvailableIndex = notifications.findIndex(
      (notif) =>
        !dismissedNotifications.includes(notif.id) && !isExpired(notif),
    );

    setCurrentNotificationIndex(
      firstAvailableIndex === -1 ? null : firstAvailableIndex,
    );
  }, [dismissedNotifications]);

  const dismissNotification = (id: string) => {
    setDismissedNotifications([...dismissedNotifications, id]);
  };

  if (currentNotificationIndex === null) {
    return null;
  }

  const currentNotification = notifications[currentNotificationIndex];

  return (
    <Card className="relative max-h-60 overflow-hidden rounded-md bg-opacity-50 shadow-none group-data-[collapsible=icon]:hidden">
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2 h-6 w-6 p-0"
        onClick={() => {
          capture("notification:dismiss_notification", {
            notification_id: currentNotification.id,
          });
          dismissNotification(currentNotification.id);
        }}
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">{currentNotification.title}</CardTitle>
        <CardDescription>{currentNotification.description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {currentNotification.link &&
          (currentNotification.linkContent ? (
            <Link
              href={currentNotification.link}
              target="_blank"
              onClick={() => {
                capture("notification:click_link", {
                  notification_id: currentNotification.id,
                });
              }}
            >
              {currentNotification.linkContent}
            </Link>
          ) : (
            <Button variant="secondary" size="sm" asChild>
              <Link
                href={currentNotification.link}
                target="_blank"
                onClick={() => {
                  capture("notification:click_link", {
                    notification_id: currentNotification.id,
                  });
                }}
              >
                {currentNotification.linkTitle ?? "Learn more"} &rarr;
              </Link>
            </Button>
          ))}
      </CardContent>
    </Card>
  );
}
