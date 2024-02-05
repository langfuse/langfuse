import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import useLocalStorage from "@/src/components/useLocalStorage";

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

export const useCheckNotification = (notification: Notification[]) => {
  const [lastSeenId, setLastSeenId] = useLocalStorage<number>(
    "lastSeenNotificationId",
    0,
  );
  useEffect(() => {
    // We delay the notification to ensure that the Toaster component (in layout.tsx L491) is mounted before we call the toast function
    const timeoutId = setTimeout(() => {
      notification.reverse().forEach((n) => {
        if (new Date(n.releaseDate) <= new Date() && n.id > lastSeenId) {
          toast(n.message, {
            id: n.id,
            description: n.description ?? "",
            duration: Infinity,
            action: {
              label: "Dismiss",
              onClick: () => {
                setLastSeenId(n.id);
              },
            },
          });
        }
      });
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [lastSeenId, notification, setLastSeenId]);
};
