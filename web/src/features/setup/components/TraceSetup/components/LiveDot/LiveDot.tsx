import { cn } from "@/src/utils/tailwind";
import motion from "../../motion.module.css";

/** A dot that rings while Langfuse checks for traces, like a spinner; still once it stops, and under reduced motion. */
export function LiveDot({ isLive }: { isLive: boolean }) {
  return (
    <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
      {isLive ? (
        <span
          className={cn(
            "bg-primary-accent absolute inset-0 rounded-full opacity-60",
            motion.ping,
          )}
        />
      ) : null}
      <span className="bg-primary-accent relative size-2.5 rounded-full" />
    </span>
  );
}
