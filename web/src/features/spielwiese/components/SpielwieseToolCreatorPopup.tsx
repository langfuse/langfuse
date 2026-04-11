"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
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

export function SpielwieseToolCreatorPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ToolCreatorMode>("builder");

  return (
    <div className="relative shrink-0">
      <Button
        className="border-border/50 bg-muted/28 text-foreground/78 hover:bg-muted/34 hover:text-foreground h-7 overflow-hidden rounded-md border px-0 text-[13px] font-medium"
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setIsOpen(true)}
      >
        <span className="bg-muted/55 text-foreground/56 grid h-full w-6 shrink-0 place-items-center">
          <Wrench aria-hidden="true" className="size-3.5" />
        </span>
        <span className="px-2.5">Create tool</span>
      </Button>
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
