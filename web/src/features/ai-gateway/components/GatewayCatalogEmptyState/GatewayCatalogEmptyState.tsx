import { type ReactNode, useId } from "react";
import { ChevronRight, type IconComponent } from "@langfuse/icons";
import { cva } from "class-variance-authority";

import { Button } from "@/src/components/design-system/Button/Button";

import styles from "./gatewayCatalogEmptyState.module.css";

const cardVariants = cva(
  // One step above `rounded-lg`, so the card reads rounder than its 8px tile.
  "bg-card flex w-full items-center rounded-[calc(var(--radius)+2px)] border p-4 text-left",
  {
    variants: {
      interactive: {
        true: [
          styles.interactive,
          "focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2",
        ],
        false: "",
      },
    },
  },
);

type GatewayCatalogEmptyStateAction =
  | {
      text: string;
      variant?: "primary" | "outline";
      icon?: IconComponent;
      href: string;
    }
  | {
      text: string;
      variant?: "primary" | "outline";
      icon?: IconComponent;
      onClick: () => void;
    };

type GatewayCatalogEmptyStateOption = {
  id: string;
  title: string;
  hint: string;
  icon: IconComponent;
  actionLabel?: string;
  /** Makes the card a button that starts creation for this option. */
  onSelect?: () => void;
};

export type GatewayCatalogEmptyStateProps = {
  title: string;
  description: string;
  actions: readonly GatewayCatalogEmptyStateAction[];
  optionsHeading: string;
  options: readonly GatewayCatalogEmptyStateOption[];
  /** Diagram rendered between the header actions and the option grid. */
  children: ReactNode;
};

/** Shared empty-state layout for AI Gateway pages that offer a catalog of options below a diagram. */
export function GatewayCatalogEmptyState({
  title,
  description,
  actions,
  optionsHeading,
  options,
  children,
}: GatewayCatalogEmptyStateProps) {
  const titleId = useId();
  const optionsHeadingId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="@container mx-auto flex w-full max-w-5xl flex-col gap-14 py-6"
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 id={titleId} className="text-3xl font-bold tracking-tight">
            {title}
          </h2>
          <p className="text-foreground-secondary max-w-lg text-base">
            {description}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {actions.map((action) => (
              <ActionButton key={action.text} action={action} />
            ))}
          </div>
        </div>
        {children}
      </div>
      <section
        aria-labelledby={optionsHeadingId}
        className="flex flex-col gap-4"
      >
        <h3 id={optionsHeadingId} className="text-lg font-bold">
          {optionsHeading}
        </h3>
        <ul className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {options.map((option) => (
            <li key={option.id}>
              <OptionCard option={option} />
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function ActionButton({ action }: { action: GatewayCatalogEmptyStateAction }) {
  if ("href" in action) {
    return (
      <Button
        variant={action.variant}
        text={action.text}
        icon={action.icon}
        href={action.href}
      />
    );
  }

  return (
    <Button
      variant={action.variant}
      text={action.text}
      icon={action.icon}
      onClick={action.onClick}
    />
  );
}

function OptionCard({ option }: { option: GatewayCatalogEmptyStateOption }) {
  const { title, hint, icon: Icon, actionLabel, onSelect } = option;
  const content = (
    <span className="flex min-w-0 flex-1 items-center gap-3.5">
      <span
        aria-hidden="true"
        className="bg-surface-sunken text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg border"
      >
        <Icon size="lg" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-bold" title={title}>
          {title}
        </span>
        <span className="text-muted-foreground truncate text-sm" title={hint}>
          {hint}
        </span>
      </span>
    </span>
  );

  if (onSelect === undefined) {
    return (
      <div className={cardVariants({ interactive: false })}>{content}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cardVariants({ interactive: true })}
    >
      {content}
      {actionLabel ? (
        <span className={`shrink-0 ${styles.action}`}>
          <span className="text-link flex items-center gap-0.5 pl-3.5 text-sm whitespace-nowrap">
            {actionLabel}
            <ChevronRight size="base" color="inherit" aria-hidden />
          </span>
        </span>
      ) : null}
    </button>
  );
}
