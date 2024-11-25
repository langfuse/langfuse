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
import useLocalStorage from "./useLocalStorage";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type SidebarNotification = {
  id: string; // Add unique ID for each notification
  title: string;
  description: React.ReactNode;
  link: string;
  // defaults to "Learn more" if no linkContent and no linkTitle
  linkTitle?: string;
  linkContent?: React.ReactNode;
};

const notifications: SidebarNotification[] = [
  {
    id: "lw2-5",
    title: "Launch Week 2 – Day 5",
    description: "Introducing Prompt Experiments to test prompts on datasets",
    link: "https://langfuse.com/changelog/2024-11-22-prompt-experimentation",
    linkTitle: "Changelog",
  },
  {
    id: "lw2-4",
    title: "Launch Week 2 – Day 4",
    description: "All new docs for datasets, experiments, and evaluations",
    link: "https://langfuse.com/changelog/2024-11-21-all-new-datasets-and-evals-documentation",
    linkTitle: "Changelog",
  },
  {
    id: "lw2-3",
    title: "Launch Week 2 – Day 3",
    description:
      "Full multi-modal support including images, audio, and attachments",
    link: "https://langfuse.com/changelog/2024-11-20-full-multi-modal-images-audio-attachments",
    linkTitle: "Changelog",
  },
  {
    id: "lw2-2",
    title: "Launch Week 2 – Day 2",
    description: "LLM-as-a-Judge Evaluators for Dataset Experiments",
    link: "https://langfuse.com/changelog/2024-11-19-llm-as-a-judge-for-datasets",
    linkTitle: "Changelog",
  },
  {
    id: "lw2-1",
    title: "Launch Week 2 – Day 1",
    description: "New side-by-side comparison view for dataset experiment runs",
    link: "https://langfuse.com/changelog/2024-11-18-dataset-runs-comparison-view",
    linkTitle: "Changelog",
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
        alt="Langfuse Github stars"
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

  // Find the oldest non-dismissed notification on mount or when dismissed list changes
  useEffect(() => {
    const lastAvailableIndex = notifications
      .slice()
      .reverse()
      .findIndex((notif) => !dismissedNotifications.includes(notif.id));

    setCurrentNotificationIndex(
      lastAvailableIndex === -1
        ? null
        : notifications.length - 1 - lastAvailableIndex,
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
        {currentNotification.linkContent ? (
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
        )}
      </CardContent>
    </Card>
  );
}
