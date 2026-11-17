import { cn } from "@/src/utils/tailwind";
// Exploratory scatter looks
import { lookStyle, type TopicMapLookName } from "./map/topic-map-looks";
import styles from "./map/topic-map.module.css";

export function TopicMapLoading({ fillContainer, look }: TopicMapLoadingProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden text-sm",
        look ? styles.look : "bg-muted/20",
        fillContainer && "h-full min-h-0",
      )}
      style={look && lookStyle(look)}
    >
      <div
        className={cn(
          "flex items-center justify-center",
          fillContainer
            ? "min-h-0 flex-1"
            : "h-[clamp(380px,64vh,820px)] min-h-[340px]",
        )}
      >
        Loading embedding map…
      </div>
    </div>
  );
}

type TopicMapLoadingProps = {
  fillContainer: boolean;
  /** Exploratory scatter looks: load on the look's background, so switching facets does not flash. */
  look?: TopicMapLookName;
};
