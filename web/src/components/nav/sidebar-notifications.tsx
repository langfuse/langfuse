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
        className="absolute right-1.5 top-2.5 h-5 w-5 p-0"
        onClick={() => {
          capture("notification:dismiss_notification", {
            notification_id: currentNotification.id,
          });
          dismissNotification(currentNotification.id);
        }}
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <CardHeader className="px-3 pb-0 pr-6 pt-2.5">
        <CardTitle className="text-sm">{currentNotification.title}</CardTitle>
        <CardDescription className="mt-1">
          {currentNotification.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 pb-2.5 pt-1.5">
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
            <Button variant="secondary" size="sm" className="w-full" asChild>
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
