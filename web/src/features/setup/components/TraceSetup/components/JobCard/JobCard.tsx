import { ArrowRight } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IllustrationHost } from "@/src/components/design-system/IllustrationHost/IllustrationHost";
import { SpotIllustration } from "@/src/components/design-system/SpotIllustration/SpotIllustration";
import { cn } from "@/src/utils/tailwind";
import motion from "../../motion.module.css";

type JobCardProps = {
  title: string;
  description: string;
  drawing:
    | "failedSpan"
    | "metrics"
    | "prompts"
    | "datasetRuns"
    | "sessions"
    | "evaluators";
  /** The page the job opens. */
  action: { text: string; href: string };
  /** Jobs that need a trace to work on wait for the first one. */
  isLocked: boolean;
  /** Opened in front of you, by the first trace landing: the card lifts and its drawing builds again. */
  isUnlocking: boolean;
};

/** One thing to do next, its drawing tucked into the corner; hovering the card plays it. */
export function JobCard({
  title,
  description,
  drawing,
  action,
  isLocked,
  isUnlocking,
}: JobCardProps) {
  return (
    <IllustrationHost>
      <div
        className={cn(
          "bg-muted/60 relative flex h-full min-h-44 flex-col overflow-hidden rounded-2xl p-6 sm:min-h-60",
          isUnlocking && motion.unlock,
        )}
      >
        <h3 className="text-base font-bold">{title}</h3>
        <p className="text-muted-foreground mt-1.5 max-w-60 text-sm">
          {description}
        </p>
        <div className="relative z-10 mt-auto pt-5">
          {isLocked ? (
            <span className="text-muted-foreground inline-flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="border-muted-foreground size-2 rounded-full border-[1.5px] border-dashed"
              />
              After first trace
            </span>
          ) : (
            <Button
              text={action.text}
              variant="secondary"
              size="sm"
              trailingIcon={ArrowRight}
              href={action.href}
            />
          )}
        </div>
        <span
          className={cn(
            "absolute -right-3.5 -bottom-2.5 flex transition-[filter,opacity,transform] duration-600 ease-out motion-reduce:transition-none",
            isLocked && "translate-x-1.5 translate-y-1.5 opacity-45 grayscale",
          )}
        >
          <SpotIllustration
            key={isUnlocking ? "unlocked" : "steady"}
            drawing={drawing}
            size="md"
            motion={isLocked ? "off" : "subtle"}
            backdrop="none"
            accent="none"
          />
        </span>
      </div>
    </IllustrationHost>
  );
}
