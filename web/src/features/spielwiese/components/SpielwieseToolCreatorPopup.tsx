"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  SpielwieseToolCreatorPopupContent,
  type ToolCreatorMode,
} from "./SpielwieseToolCreatorPopupContent";
import { SpielwieseHeaderStripTag } from "./SpielwieseHeaderStrip";
import {
  spielwieseHeaderButtonInertClassName,
  spielwieseHeaderButtonStaticClassName,
} from "./spielwieseHeaderButtonStyles";

const toolCreatorModes = [
  { label: "Builder", value: "builder" },
  { label: "JSON", value: "json" },
] as const satisfies ReadonlyArray<{ label: string; value: ToolCreatorMode }>;

function ToolCreatorModeToggle({
  mode,
  onModeChange,
}: {
  mode: ToolCreatorMode;
  onModeChange: (value: ToolCreatorMode) => void;
}) {
  return (
    <div className="flex gap-1">
      {toolCreatorModes.map((option) => (
        <Button
          key={option.value}
          size="sm"
          type="button"
          variant={mode === option.value ? "secondary" : "outline"}
          onClick={() => onModeChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function ToolCreatorCard({
  mode,
  onClose,
  onModeChange,
}: {
  mode: ToolCreatorMode;
  onClose: () => void;
  onModeChange: (value: ToolCreatorMode) => void;
}) {
  return (
    <Card
      aria-modal="true"
      className="w-full max-w-[34rem] border-0 shadow-none"
      data-testid="spielwiese-tool-creator-popup"
      role="dialog"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Add tool</CardTitle>
          <CardDescription>
            Define what this tool does and the model will call it when needed.
          </CardDescription>
        </div>
        <ToolCreatorModeToggle mode={mode} onModeChange={onModeChange} />
      </CardHeader>
      <CardContent>
        <SpielwieseToolCreatorPopupContent mode={mode} />
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button size="sm" type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" type="button" onClick={onClose}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

function ToolCreatorTriggerContent({
  summaryLabel,
  variant,
}: {
  summaryLabel: string;
  variant: "default" | "row";
}) {
  return variant === "row" ? (
    <span className="flex min-w-0 items-center gap-2">
      <Wrench aria-hidden="true" className="text-foreground/56 size-3.5" />
      <span className="min-w-0 truncate">{summaryLabel}</span>
    </span>
  ) : (
    <>
      <SpielwieseHeaderStripTag
        label="Tools"
        revealLabelWidthClassName="max-w-0"
        revealWidthClassName="w-6"
      >
        <Wrench aria-hidden="true" className="size-3.5 shrink-0" />
      </SpielwieseHeaderStripTag>
      <span className="px-2.5">{summaryLabel}</span>
    </>
  );
}

export function SpielwieseToolCreatorPopup({
  summaryLabel = "any",
  variant = "default",
}: {
  summaryLabel?: string;
  variant?: "default" | "row";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ToolCreatorMode>("builder");
  const triggerClassName =
    variant === "row"
      ? "border-border/40 bg-background/88 text-foreground/78 hover:bg-background hover:text-foreground h-8 rounded-lg border px-3 text-[0.8125rem] font-medium shadow-[inset_0_1px_0_hsl(var(--background)/0.96)]"
      : `${spielwieseHeaderButtonStaticClassName} inline-flex h-7 items-center justify-center gap-0 overflow-hidden rounded-[10px] px-0 text-[13px] font-medium whitespace-nowrap`;
  const TriggerElement = variant === "row" ? Button : "button";

  return (
    <div className="relative shrink-0">
      <TriggerElement
        aria-disabled="true"
        aria-label="Create tool"
        className={cn(triggerClassName, spielwieseHeaderButtonInertClassName)}
        {...(variant === "row"
          ? { size: "sm", variant: "ghost" as const }
          : {})}
        tabIndex={-1}
        type="button"
      >
        <ToolCreatorTriggerContent
          summaryLabel={summaryLabel}
          variant={variant}
        />
      </TriggerElement>
      {isOpen ? (
        <div
          className="bg-background/80 fixed inset-0 z-40 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <ToolCreatorCard
            mode={mode}
            onClose={() => setIsOpen(false)}
            onModeChange={setMode}
          />
        </div>
      ) : null}
    </div>
  );
}
