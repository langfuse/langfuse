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
    releaseDate: "05.02.2024",
    message: "Langfuse 2.1 just released 🚀 check it out",
    description: (
      <Link href={"https://www.langfuse.com/changelog"}>
        Click to check out the new features and improvements
      </Link>
    ),
  },
  {
    id: 3,
    releaseDate: "06.02.2024",
    message: "Langfuse 2.2 just released 🚀 check it out",
  },
];

export const useCheckNotification = (
  notification: Notification[],
  authenticated: boolean,
) => {
  const [lastSeenId, setLastSeenId] = useLocalStorage<number>(
    "lastSeenNotificationId",
    0,
  );
  useEffect(() => {
    if (!authenticated) {
      return;
    }
    const timeoutId = setTimeout(() => {
      notification.reverse().forEach((n) => {
        if (new Date(n.releaseDate) >= new Date() && n.id > lastSeenId) {
          toast.custom(
            (t) => (
              <div className="relative box-border flex justify-between rounded-lg border p-4">
                <div className="min-w-0 flex-1">
                  <p
                    className={`m-0 text-sm font-medium leading-none text-gray-800 ${n.description ? "mb-2" : ""}`}
                  >
                    {n.message}
                  </p>
                  {n.description && (
                    <p className="m-0 text-sm leading-none text-gray-800">
                      {n.description}
                    </p>
                  )}
                </div>
                <button
                  className="flex h-6 w-6 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-gray-800 transition-colors duration-200"
                  onClick={() => {
                    setLastSeenId(n.id);
                    toast.dismiss(t);
                  }}
                  aria-label="Close"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M2.96967 2.96967C3.26256 2.67678 3.73744 2.67678 4.03033 2.96967L8 6.939L11.9697 2.96967C12.2626 2.67678 12.7374 2.67678 13.0303 2.96967C13.3232 3.26256 13.3232 3.73744 13.0303 4.03033L9.061 8L13.0303 11.9697C13.2966 12.2359 13.3208 12.6526 13.1029 12.9462L13.0303 13.0303C12.7374 13.3232 12.2626 13.3232 11.9697 13.0303L8 9.061L4.03033 13.0303C3.73744 13.3232 3.26256 13.3232 2.96967 13.0303C2.67678 12.7374 2.67678 12.2626 2.96967 11.9697L6.939 8L2.96967 4.03033C2.7034 3.76406 2.6792 3.3474 2.89705 3.05379L2.96967 2.96967Z"></path>
                  </svg>
                </button>
              </div>
            ),
            {
              id: n.id.toString(),
              duration: 99999,
            },
          );
        }
      });
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [lastSeenId, notification, setLastSeenId, authenticated]);
};
