import Link from "next/link";
import { toast } from "sonner";

export interface Notification {
  id: number;
  releaseDate: string;
  message: string | JSX.Element;
  description?: JSX.Element | string;
}

export const NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    releaseDate: "01.02.2024",
    message: "Langfuse 2.0 just released 🚀 check it out",
    description: (
      <Link href={"https://www.langfuse.com/changelog"}>
        Click to check out the new features and improvements
      </Link>
    ),
  },
  {
    id: 2,
    releaseDate: "02.02.2024",
    message: "Langfuse 2.1 just released 🚀 check it out",
  },
  {
    id: 3,
    releaseDate: "05.02.2024",
    message: "Langfuse 2.2 just released 🚀 check it out",
  },
];

export const checkNotification = (notification: Notification[]) => {
  const lastSeenId = localStorage.getItem("lastSeenNotificationId") ?? "0";
  notification.reverse().forEach((n) => {
    if (new Date(n.releaseDate) <= new Date() && n.id > parseInt(lastSeenId)) {
      toast(n.message, {
        description: n.description ?? "",
        duration: Infinity,
        action: {
          label: "Dismiss",
          onClick: () => {
            localStorage.setItem("lastSeenNotificationId", n.id.toString());
          },
        },
      });
    }
  });
};
