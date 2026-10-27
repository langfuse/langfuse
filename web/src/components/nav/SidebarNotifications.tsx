import Link from "next/link";
import { X } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  SIDEBAR_NOTIFICATIONS,
  type SidebarNotification,
} from "@/src/components/nav/sidebarNotifications";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export type SidebarNotificationState = {
  dismissedIds: string[];
  onDismiss: (id: string) => void;
  onLinkClick: (id: string) => void;
};

/** Notifications the user has not dismissed and that have not expired. */
export function getActiveSidebarNotifications(
  dismissedIds: string[],
): SidebarNotification[] {
  return SIDEBAR_NOTIFICATIONS.filter((notification) => {
    if (dismissedIds.includes(notification.id)) return false;
    if (!notification.createdAt) return true;

    const createdAt = new Date(notification.createdAt).getTime();
    return Date.now() <= createdAt + (notification.ttlMs ?? TWO_WEEKS_MS);
  });
}

export function SidebarNotifications({
  state,
  activeNotifications,
}: {
  state: SidebarNotificationState;
  activeNotifications: SidebarNotification[];
}) {
  const visibleNotifications = activeNotifications.slice(0, 3);
  const frontNotification = visibleNotifications[0];
  const backCount = visibleNotifications.length - 1;
  const peekOffset = 8;
  const peekScaleStep = 0.05;

  return (
    <div
      className="group-data-[collapsible=icon]:hidden"
      style={{ paddingBottom: backCount * peekOffset + 2 }}
    >
      <div className="relative">
        {Array.from({ length: backCount }).map((_, index) => {
          const stackIndex = index + 1;
          return (
            <Card
              key={`stack-${stackIndex}`}
              aria-hidden
              className="bg-card pointer-events-none absolute inset-0 rounded-md shadow-none"
              style={{
                transform: `translateY(${stackIndex * peekOffset}px) scaleX(${
                  1 - stackIndex * peekScaleStep
                })`,
                transformOrigin: "top center",
                zIndex: visibleNotifications.length - stackIndex,
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
            onClick={() => state.onDismiss(frontNotification.id)}
            title="Dismiss"
          >
            <X size="base" color="default" />
          </Button>
          <CardHeader className="px-3 pt-2.5 pr-6 pb-0">
            <CardTitle className="text-sm">{frontNotification.title}</CardTitle>
            <CardDescription className="mt-1">
              {frontNotification.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pt-1.5 pb-2.5">
            {frontNotification.link &&
              (frontNotification.linkImage ? (
                <Link
                  href={frontNotification.link}
                  target="_blank"
                  onClick={() => state.onLinkClick(frontNotification.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={frontNotification.linkImage.alt}
                    src={frontNotification.linkImage.src}
                  />
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
                    onClick={() => state.onLinkClick(frontNotification.id)}
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
