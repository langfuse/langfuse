// PROTOTYPE — throwaway. Variant C: a mega-menu role picker — role list on the
// left, a live full-permission preview of the focused role on the right.

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { PopoverController } from "@/src/components/ui/popover";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { cn } from "@/src/utils/tailwind";
import {
  type ApiKeyDraft,
  type PresetKey,
  type ProjectOption,
  presetIcons,
  presets,
} from "../prototype/permissionCatalog";
import { KeyFormShell } from "./KeyFormShell";
import { RolePermissionList, rolePermissionCount } from "./rolePermissions";

/** variantSplitMeta labels the split-preview variant in the switcher. */
export const variantSplitMeta = { key: "C", name: "Split preview menu" };

const roles = presets.filter((p) => p.key !== "custom");

/** VariantSplit renders a two-pane role picker previewing each role's permissions. */
export const VariantSplit = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => {
  const [preview, setPreview] = useState<PresetKey>(draft.preset);
  const SelectedIcon = presetIcons[draft.preset];
  const selectedLabel = presets.find((p) => p.key === draft.preset)?.label;

  return (
    <KeyFormShell projects={projects} draft={draft} setDraft={setDraft}>
      <PopoverController
        align="start"
        modal={false}
        disabled={false}
        contentClassName="w-[34rem] p-0"
        renderContent={({ closePopover }) => (
          <div className="flex h-72">
            <div className="w-1/2 border-r p-1">
              {roles.map((p) => {
                const Icon = presetIcons[p.key];
                return (
                  <button
                    key={p.key}
                    type="button"
                    onMouseEnter={() => setPreview(p.key)}
                    onFocus={() => setPreview(p.key)}
                    onClick={() => {
                      setDraft({ ...draft, preset: p.key });
                      closePopover();
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm",
                      preview === p.key ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{p.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {p.description}
                      </span>
                    </span>
                    {draft.preset === p.key && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex w-1/2 flex-col">
              <div className="text-muted-foreground border-b px-4 py-2 text-xs font-bold">
                {rolePermissionCount(preview)} permissions
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  <RolePermissionList preset={preview} dense />
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <div
              tabIndex={0}
              className="border-input bg-background flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              <SelectedIcon className="h-4 w-4 shrink-0" />
              <span className="flex-1 font-bold">{selectedLabel}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Trigger>
        )}
      </PopoverController>
    </KeyFormShell>
  );
};
