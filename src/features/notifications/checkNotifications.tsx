import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import useLocalStorage from "@/src/components/useLocalStorage";
import Notification, {
  type TNotification,
} from "@/src/features/notifications/Notification";
import { Button } from "@/src/components/ui/button";

export const NOTIFICATIONS: TNotification[] = [
  {
    id: 1,
    releaseDate: new Date("2024-01-29"),
    message: "New: Custom model prices",
    description: (
      <div>
        <p>
          Langfuse now supports any LLM model for usage cost tracking. The
          highlights:
        </p>
        <ul className="ms-4 mt-2 list-outside list-disc">
          <li>Create custom model definitions to define your own pricing.</li>
          <li>Ingest cost per generation via the SDK/API.</li>
          <li>
            Choose among a variety of usage units like Tokens, Seconds or
            Characters
          </li>
        </ul>
        <Button size="sm" variant="secondary" className="mt-3">
          <Link href="https://langfuse.com/changelog/2024-01-29-custom-model-prices">
            Changelog post
          </Link>
        </Button>
      </div>
    ),
  },
];

export const useCheckNotification = (
  notification: TNotification[],
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
      notification
        .reverse()
        .filter(
          (n) =>
            // only show notifications that are less than 30 days old
            (new Date().getTime() - n.releaseDate.getTime()) /
              (1000 * 60 * 60 * 24) <=
            30,
        )
        .forEach((n) => {
          if (n.id > lastSeenId) {
            toast.custom(
              (t) => (
                <Notification
                  notification={n}
                  setLastSeenId={setLastSeenId}
                  dismissToast={toast.dismiss}
                  toast={t}
                />
              ),
              {
                // needed to upsert toasts in case it is rendered multiple times
                id: n.id.toString(),
                duration: 600_000, // 10 minutes
                style: {
                  padding: "1rem",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                },
              },
            );
          }
        });
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [lastSeenId, notification, setLastSeenId, authenticated]);
};
