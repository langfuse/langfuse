import { type ReactNode } from "react";
import { AlertCircle, AlertTriangle, type LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/src/utils/tailwind";

export type IssueVariant = "error" | "warning";

/**
 * Colored chrome — border + bg + text — applied to elements that carry a full
 * issue notice (banner, list root, card footer strip). Each consumer composes
 * this with its own layout classes.
 */
export const issueChromeVariants = cva("", {
  variants: {
    variant: {
      error: "border-destructive/50 bg-destructive/10 text-destructive",
      warning:
        "border-amber-500/50 bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-500",
    },
  },
});

/** Outer card border that picks up a variant accent only when there is an issue. */
export const issueCardVariants = cva("rounded-lg border", {
  variants: {
    variant: {
      none: "",
      error: "border-destructive/50",
      warning: "border-amber-500/50",
    },
  },
  defaultVariants: { variant: "none" },
});

/**
 * Text color for inner elements that set their own color and therefore do not
 * inherit from a variant-styled ancestor (e.g. Button's `variant="link"` that
 * forces `text-primary`).
 */
export const issueTextVariants = cva("", {
  variants: {
    variant: {
      error: "text-destructive",
      warning: "text-amber-600 dark:text-amber-500",
    },
  },
});

export const issueIcons: Record<IssueVariant, LucideIcon> = {
  error: AlertCircle,
  warning: AlertTriangle,
};

export function IssueBanner({
  variant,
  title,
  description,
  children,
}: {
  variant: IssueVariant;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const Icon = issueIcons[variant];
  return (
    <div
      className={cn("rounded-md border p-3", issueChromeVariants({ variant }))}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs opacity-80">{description}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function IssueList({
  variant,
  title,
  children,
}: {
  variant: IssueVariant;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-h-[5vh] overflow-y-auto rounded-md border p-2",
        issueChromeVariants({ variant }),
      )}
    >
      <p className="mb-1 text-xs font-medium">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

export function IssueItem({ children }: { children: ReactNode }) {
  return <li className="text-xs">{children}</li>;
}
