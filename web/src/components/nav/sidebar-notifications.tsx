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

export const notifications: SidebarNotification[] = [
  {
    id: "lw5-1",
    title: "Launch Week: Day 1",
    description:
      "Run experiments inside GitHub Actions to test every PR against a Langfuse dataset.",
    link: "https://langfuse.com/changelog/2026-05-25-experiment-ci-cd-gates",
    linkTitle: "Learn more",
    createdAt: "2026-05-25",
  },
  {
    id: "lw5-2",
    title: "Launch Week: Day 2",
    description:
      "Langfuse agent skill turns Langfuse into a headless platform to evaluate, query and instrument your application.",
    link: "https://langfuse.com/changelog/2026-05-26-langfuse-agent-skill",
    linkTitle: "Learn more",
    createdAt: "2026-05-26",
  },
  {
    id: "lw5-3",
    title: "Launch Week: Day 3",
    description: "Fast full-text search on observation I/O via the UI and API",
    link: "https://langfuse.com/changelog/2026-05-27-clickhouse-full-text-search-fast-mode",
    linkTitle: "Learn more",
    createdAt: "2026-05-27",
  },
  {
    id: "lw5-4",
    title: "Launch Week: Day 4",
    description:
      "Code evaluators let you score observations and experiments with Python/TypeScript checks.",
    link: "https://langfuse.com/changelog/2026-05-28-code-evaluators",
    linkTitle: "Learn more",
    createdAt: "2026-05-28",
  },
  {
    id: "lw5-5",
    title: "Launch Week: Day 5",
    description:
      "Langfuse MCP now covers observations, metrics, scores, datasets, comments, and more.",
    link: "https://langfuse.com/launch-week-5",
    linkTitle: "Learn more",
    createdAt: "2026-05-29",
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

  const MAX_STACK = 3;
  const visibleNotifications = activeNotifications.slice(0, MAX_STACK);
  const frontNotification = visibleNotifications[0];
  const backCount = visibleNotifications.length - 1;
  const peekOffset = 8;
  const peekScaleStep = 0.05;
  const extraBottomPadding = backCount * peekOffset + 2;

  return (
    <div
      className="group-data-[collapsible=icon]:hidden"
      style={{ paddingBottom: extraBottomPadding }}
    >
      <div className="relative">
        {Array.from({ length: backCount }).map((_, i) => {
          const index = i + 1;
          return (
            <Card
              key={`stack-${index}`}
              aria-hidden
              className="bg-card pointer-events-none absolute inset-0 rounded-md shadow-none"
              style={{
                transform: `translateY(${index * peekOffset}px) scaleX(${
                  1 - index * peekScaleStep
                })`,
                transformOrigin: "top center",
                zIndex: visibleNotifications.length - index,
              }}
            />
          );
        })}
        <Card
          key={frontNotification.id}
          className="bg-card relative max-h-60 overflow-hidden rounded-md shadow-none"
          style={{ zIndex: visibleNotifications.length }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2.5 right-1.5 h-5 w-5 p-0"
            onClick={() => {
              capture("notification:dismiss_notification", {
                notification_id: frontNotification.id,
              });
              dismissNotification(frontNotification.id);
            }}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <CardHeader className="px-3 pt-2.5 pr-6 pb-0">
            <CardTitle className="text-sm">{frontNotification.title}</CardTitle>
            <CardDescription className="mt-1">
              {frontNotification.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pt-1.5 pb-2.5">
            {frontNotification.link &&
              (frontNotification.linkContent ? (
                <Link
                  href={frontNotification.link}
                  target="_blank"
                  onClick={() => {
                    capture("notification:click_link", {
                      notification_id: frontNotification.id,
                    });
                  }}
                >
                  {frontNotification.linkContent}
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <Link
                    href={frontNotification.link}
                    target="_blank"
                    onClick={() => {
                      capture("notification:click_link", {
                        notification_id: frontNotification.id,
                      });
                    }}
                  >
                    {frontNotification.linkTitle ?? "Learn more"} &rarr;
                  </Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
