import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { cn } from "@/src/utils/tailwind";

/**
 * Positioned, so each item paints its ring over the item before it; the
 * avatar inside is positioned too and would otherwise cover that ring.
 */
const stackedItemClass =
  "ring-background relative inline-flex shrink-0 rounded-full ring-2";

type AvatarGroupProps = {
  avatars: { id: string; displayName: string; email?: string; src?: string }[];
  /** Avatars shown before the rest collapse into a trailing "+N" count. */
  max: number;
  /** Names the group, such as "7 members"; it heads the hover card. */
  label: string;
};

function AvatarGroup({ avatars, max, label }: AvatarGroupProps) {
  const shown = avatars.slice(0, max);
  const overflow = avatars.length - shown.length;

  return (
    <HoverCard
      openDelay={150}
      closeDelay={100}
      placement="bottom"
      content={
        <div className="flex max-h-72 w-64 flex-col gap-2 overflow-y-auto p-3 text-xs">
          <p className="font-medium">{label}</p>
          <ul className="flex flex-col gap-1.5">
            {avatars.map((avatar) => (
              <li key={avatar.id} className="flex items-center gap-2">
                {/* The name sits beside it, so its tooltip stays closed. */}
                <span className="pointer-events-none inline-flex">
                  <Avatar
                    aria-hidden
                    size="sm"
                    tone="tinted"
                    displayName={avatar.displayName}
                    src={avatar.src}
                  />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate" title={avatar.displayName}>
                    {avatar.displayName}
                  </span>
                  {avatar.email && avatar.email !== avatar.displayName && (
                    <span
                      className="text-muted-foreground truncate"
                      title={avatar.email}
                    >
                      {avatar.email}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        // One hover target for the whole stack: the card names everyone, so
        // the items ignore the pointer and the avatars' own tooltips stay
        // closed.
        <span
          className="inline-flex items-center -space-x-0.5 *:pointer-events-none"
          tabIndex={0}
          aria-label={label}
          {...getTriggerProps()}
        >
          {shown.map((avatar) => (
            // The opaque backdrop keeps the previous avatar from showing
            // through a translucent tinted fallback.
            <span
              key={avatar.id}
              className={cn(stackedItemClass, "bg-background")}
            >
              <Avatar
                aria-hidden
                size="sm"
                tone="tinted"
                displayName={avatar.displayName}
                src={avatar.src}
              />
            </span>
          ))}
          {overflow > 0 && (
            // Sits a pixel left of centre: the plus sign is lighter than the
            // digits, so a centred count reads as pushed right.
            <span
              className={cn(
                stackedItemClass,
                "bg-muted text-muted-foreground h-6 min-w-6 items-center justify-center pr-1.25 pl-0.75 text-xs tabular-nums",
              )}
            >
              +{overflow}
            </span>
          )}
        </span>
      )}
    </HoverCard>
  );
}

export { AvatarGroup };
