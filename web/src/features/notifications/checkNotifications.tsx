import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  Notification,
  type TNotification,
} from "@/src/features/notifications/Notification";
import { Button } from "@/src/components/ui/button";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const ButtonWithPosthog = ({
  children,
  className,
  notificationId,
  href,
}: {
  children: React.ReactNode;
  className?: string;
  notificationId: string;
  href: string;
}) => {
  const capture = usePostHogClientCapture();
  return (
    <Button
      size="sm"
      variant="secondary"
      className={className}
      onClick={() => {
        capture("notification:click_link"),
          { notificationId: notificationId, href: href };
      }}
      asChild
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
};

export const NOTIFICATIONS: TNotification[] = [
  // {
  //   id: 3,
  //   releaseDate: new Date("2024-04-26"),
  //   message: "Langfuse 2.0 is live on ProductHunt",
  // },
  {
    id: 2,
    releaseDate: new Date("2024-04-24"),
    message: "Langfuse Launch Week #1 is in Full Swing",
    description: (
      <div>
        <p>
          {
            "We're launching a new feature every day this week. We already launched:"
          }
        </p>
        <ul className="ms-4 mt-2 list-outside list-disc">
          <li>Langfuse x Posthog integration</li>
          <li>Python decorator integration</li>
          <li>LLM Playground</li>
          <li>More to come every day until Friday</li>
        </ul>
        <ButtonWithPosthog
          className="mt-3"
          notificationId="2"
          href="https://langfuse.com/launch"
        >
          Follow along
        </ButtonWithPosthog>
      </div>
    ),
  },
  {
    id: 1,
    releaseDate: new Date("2024-01-29"),
    message: "New: Custom model prices",
    description: (
      <div>
        <p>
          Langfuse now supports any LLM model for usage and cost tracking. The
          highlights:
        </p>
        <ul className="ms-4 mt-2 list-outside list-disc">
          <li>Define your model definitions (price, usage).</li>
          <li>Optionally, ingest cost via the API/SDK</li>
          <li>Support for usage in tokens, seconds and characters</li>
        </ul>
        {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined && (
          <p className="mt-2">
            Self-hosted: The upgrade to v2 includes a breaking change. After
            upgrading, you must run a migration script to ensure accurate usage
            and cost calculation for previously ingested traces. Please refer to
            the post for details.
          </p>
        )}
        <ButtonWithPosthog
          notificationId="1"
          href="https://langfuse.com/changelog/2024-01-29-custom-model-prices"
        >
          Changelog post
        </ButtonWithPosthog>
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
