import { cn } from "@/src/utils/tailwind";
import { lookStyle } from "./topic-map-looks";
import styles from "./topic-map.module.css";

export function ScatterMapLoading({ fillContainer }: ScatterMapLoadingProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden text-sm",
        styles.look,
        fillContainer && "h-full min-h-0",
      )}
      style={lookStyle("scatter1")}
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

type ScatterMapLoadingProps = {
  fillContainer: boolean;
};
