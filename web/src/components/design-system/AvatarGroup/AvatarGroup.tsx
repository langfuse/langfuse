import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { cn } from "@/src/utils/tailwind";

/**
 * Positioned, so each item paints its ring over the item before it; the
 * avatar inside is positioned too and would otherwise cover that ring.
 */
const stackedItemClass =
  "ring-background relative inline-flex shrink-0 rounded-full ring-2";

type AvatarGroupProps = {
  avatars: { id: string; displayName: string; src?: string }[];
  /** Avatars shown before the rest collapse into a trailing "+N" count. */
  max: number;
};

function AvatarGroup({ avatars, max }: AvatarGroupProps) {
  const shown = avatars.slice(0, max);
  const overflow = avatars.length - shown.length;

  return (
    <span className="inline-flex items-center -space-x-0.5">
      {shown.map((avatar) => (
        // The opaque backdrop keeps the previous avatar from showing through
        // a translucent tinted fallback.
        <span key={avatar.id} className={cn(stackedItemClass, "bg-background")}>
          <Avatar
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
  );
}

export { AvatarGroup };
