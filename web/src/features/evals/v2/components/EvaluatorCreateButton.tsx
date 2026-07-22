import {
  ChevronDown,
  FilePlus2,
  LayoutTemplate,
  Plus,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { ActionButton } from "@/src/components/ActionButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

function CreationMenuItem({
  icon,
  label,
  description,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      className="items-start gap-2.5 px-2.5 py-2"
      onSelect={onSelect}
    >
      <span className="bg-muted text-primary-accent mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">
          {description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

export function EvaluatorCreateButton({
  hasWriteAccess,
  canUseAssistant,
  onCreateWithAi,
  onStartFromTemplate,
  onStartFromScratch,
}: {
  hasWriteAccess: boolean;
  canUseAssistant: boolean;
  onCreateWithAi: () => void;
  onStartFromTemplate: () => void;
  onStartFromScratch: () => void;
}) {
  if (!hasWriteAccess) {
    return (
      <ActionButton
        hasAccess={false}
        icon={<Plus className="h-4 w-4" />}
        className="-translate-y-2"
      >
        New evaluator
      </ActionButton>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton
          icon={<Plus className="h-4 w-4" />}
          className="-translate-y-2"
        >
          New evaluator
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <CreationMenuItem
          icon={<LayoutTemplate className="size-4" />}
          label="Start from example"
          description="Browse ready-to-use evaluator examples"
          onSelect={onStartFromTemplate}
        />
        {canUseAssistant ? (
          <CreationMenuItem
            icon={<Sparkles className="size-4" />}
            label="Create with AI"
            description="Use the assistant to turn data insights into an evaluator"
            onSelect={onCreateWithAi}
          />
        ) : null}
        <CreationMenuItem
          icon={<FilePlus2 className="size-4" />}
          label="Start from scratch"
          description="Configure a new evaluator yourself"
          onSelect={onStartFromScratch}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
