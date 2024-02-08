import { useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import useLocalStorage from "@/src/components/useLocalStorage";
import Notification, {
  type TNotification,
} from "@/src/features/notifications/Notification";

export const NOTIFICATIONS: TNotification[] = [
  {
    id: 1,
    releaseDate: new Date("2024-01-01"),
    message: "🚢 Custom models and pricings",
    description: (
      <Link
        href={"https://langfuse.com/changelog/2024-01-29-custom-model-prices"}
      >
        <p>
          Click to check out revamped models and pricings:
          <br />
          <br />
        </p>
        <ul className="ms-4 list-outside list-disc">
          <li>Ingest your calculated cost via the SKDs</li>
          <li>Define custom models with own names and prices</li>
          <li>
            Choose among a variety of usage units like{" "}
            <span className="inline">Tokens</span>,{" "}
            <span className="inline">Seconds</span> or{" "}
            <span className="inline">Characters</span>
          </li>
        </ul>
      </Link>
    ),
  },
  // {
  //   id: 2,
  //   releaseDate: "05/02/2024",
  //   message:
  //     "Langfuse 2.1 just released 🚀 check the very long announcement notification out",
  //   description: (
  //     <Link
  //       href={"https://www.langfuse.com/changelog"}
  //       className="my-2 rounded-md border border-gray-800 px-2 py-1 text-gray-800"
  //     >
  //       View changes
  //     </Link>
  //   ),
  // },
  // {
  //   id: 3,
  //   releaseDate: "06/02/2024",
  //   message: "We got nominated for the Kitty Awards 🏆",
  //   description: (
  //     <Link href={"https://www.langfuse.com/changelog"}>
  //       Vote for us and get a chance to win a lifetime subscription
  //     </Link>
  //   ),
  // },
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
      notification.reverse().forEach((n) => {
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
              duration: 99999,
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
