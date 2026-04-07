import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { X } from "lucide-react";
import useLocalStorage from "../useLocalStorage";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

type SidebarNotification = {
  id: string; // Add unique ID for each notification
  title: string;
  description: React.ReactNode;
  createdAt?: string; // optional, used to expire the notification
  link?: string;
  // defaults to "Learn more" if no linkContent and no linkTitle
  linkTitle?: string;
  linkContent?: React.ReactNode;
  // Time-to-live in milliseconds from createdAt. Defaults to TWO_WEEKS_MS.
  ttlMs?: number;
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
        src="https://img.shields.io/github/stars/langfuse/langfuse?label=langfuse&style=social"
      />
    ),
  },
];

const STORAGE_KEY = "dismissed-sidebar-notifications";

export function SidebarNotifications() {
  const capture = usePostHogClientCapture();

  const [dismissedNotifications, setDismissedNotifications] = useLocalStorage<
    string[]
  >(STORAGE_KEY, []);

  const isExpired = (notif: SidebarNotification) => {
    if (!notif.createdAt) return false;
    const created = new Date(notif.createdAt).getTime();
    const ttl = notif.ttlMs ?? TWO_WEEKS_MS;
    return Date.now() > created + ttl;
  };

  const dismissNotification = (id: string) => {
    setDismissedNotifications([...dismissedNotifications, id]);
  };

  const activeNotifications = notifications.filter(
    (notif) => !dismissedNotifications.includes(notif.id) && !isExpired(notif),
  );

  if (activeNotifications.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 group-data-[collapsible=icon]:hidden">
      {activeNotifications.map((notification) => (
        <Card
          key={notification.id}
          className="border-sidebar-border/70 bg-sidebar-accent/25 relative max-h-60 overflow-hidden rounded-xl shadow-none"
        >
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-6 w-6 rounded-full p-0"
            onClick={() => {
              capture("notification:dismiss_notification", {
                notification_id: notification.id,
              });
              dismissNotification(notification.id);
            }}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <CardHeader className="px-3 pt-3 pr-8 pb-0">
            <CardTitle className="text-sm font-medium">
              {notification.title}
            </CardTitle>
            <CardDescription className="text-sidebar-foreground/70 mt-1 text-sm">
              {notification.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pt-2 pb-3">
            {notification.link &&
              (notification.linkContent ? (
                <Link
                  href={notification.link}
                  target="_blank"
                  onClick={() => {
                    capture("notification:click_link", {
                      notification_id: notification.id,
                    });
                  }}
                >
                  {notification.linkContent}
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <Link
                    href={notification.link}
                    target="_blank"
                    onClick={() => {
                      capture("notification:click_link", {
                        notification_id: notification.id,
                      });
                    }}
                  >
                    {notification.linkTitle ?? "Learn more"} &rarr;
                  </Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
