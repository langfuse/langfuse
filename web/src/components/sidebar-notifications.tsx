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

type SidebarNotification = {
  id: string; // Add unique ID for each notification
  title: string;
  description: React.ReactNode;
  content: React.ReactNode;
};

const notifications: SidebarNotification[] = [
  {
    id: "github-star",
    title: "Star Langfuse",
    description:
      "See the latest releases and help grow the community on GitHub.",
    content: (
      <Link href="https://github.com/langfuse/langfuse" target="_blank">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Langfuse Github stars"
          src="https://img.shields.io/github/stars/langfuse/langfuse?label=langfuse&amp;style=social"
        />
      </Link>
    ),
  },
];

const STORAGE_KEY = "dismissed-sidebar-notifications";

export function SidebarNotifications() {
  const [currentNotificationIndex, setCurrentNotificationIndex] = useState<
    number | null
  >(null);

  const [dismissedNotifications, setDismissedNotifications] = useLocalStorage<
    string[]
  >(STORAGE_KEY, []);

  // Find the first non-dismissed notification on mount or when dismissed list changes
  useEffect(() => {
    const firstAvailableIndex = notifications.findIndex(
      (notif) => !dismissedNotifications.includes(notif.id),
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
    <Card className="relative overflow-hidden rounded-md bg-opacity-50 shadow-none group-data-[collapsible=icon]:hidden">
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2 h-6 w-6 p-0"
        onClick={() => dismissNotification(currentNotification.id)}
        title="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-sm">{currentNotification.title}</CardTitle>
        <CardDescription>{currentNotification.description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {currentNotification.content}
      </CardContent>
    </Card>
  );
}
