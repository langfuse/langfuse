import { Check } from "@langfuse/icons";
import { cn } from "@/src/utils/tailwind";
import motion from "../../motion.module.css";

const STEPS = ["Way in", "Set up", "First trace"] as const;

type Position = 1 | 2 | 3 | 4;

/** The steps that moving to each position completes, so only they animate their check. */
const DONE_BY_MOVING_TO: Record<Position, readonly number[]> = {
  1: [],
  2: [1],
  3: [2],
  4: [2, 3],
};

type SetupStepperProps = {
  /** 1 to 3 is the step in progress; 4 means all three are done. */
  current: Position;
  /** The page moved on in front of you: the steps just done land their check, and the next one lights up. */
  shouldAnimate: boolean;
};

/** The three steps to a first trace as pills; the line to the next step fills as each one is done. */
export function SetupStepper({ current, shouldAnimate }: SetupStepperProps) {
  return (
    <ol aria-label="Your first trace" className="flex items-center">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const isDone = number < current;
        const isCurrent = number === current;
        const isJustDone =
          shouldAnimate && DONE_BY_MOVING_TO[current].includes(number);
        return (
          <li key={label} className="flex items-center">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "from-dark-green to-border mx-1.5 h-0.5 w-5 rounded-full bg-linear-to-r from-50% to-50% bg-size-[200%_100%] transition-[background-position] delay-100 duration-300 ease-out motion-reduce:transition-none",
                  number <= current ? "bg-left" : "bg-right",
                )}
              />
            ) : null}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "bg-background text-muted-foreground inline-flex h-7 items-center gap-1.5 rounded-full border py-0 pr-3 pl-1 text-xs transition-[color,border-color] duration-200",
                (isDone || isCurrent) && "text-foreground",
                isCurrent && "border-primary-accent",
              )}
            >
              <span
                className={cn(
                  "bg-muted grid size-5 place-items-center rounded-full text-xs font-bold",
                  isCurrent && "bg-primary-accent text-white",
                  isDone && "bg-dark-green text-white",
                  isJustDone && motion.checkIn,
                  isCurrent && shouldAnimate && motion.stepOn,
                )}
              >
                {isDone ? <Check size="sm" aria-label="Done" /> : number}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
