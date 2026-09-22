// PROTOTYPE — throwaway. Variant B: role dropdown with an inline collapsible that
// expands the selected role's full permission list on demand.

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";
import {
  type ApiKeyDraft,
  type ProjectOption,
  presetIcons,
  presets,
} from "../prototype/permissionCatalog";
import { KeyFormShell } from "./KeyFormShell";
import {
  RolePermissionList,
  SystemRolesFooter,
  rolePermissionCount,
} from "./rolePermissions";

/** variantDisclosureMeta labels the inline-disclosure variant in the switcher. */
export const variantDisclosureMeta = { key: "B", name: "Inline disclosure" };

const roles = presets.filter((p) => p.key !== "custom");

/** VariantDisclosure renders the role dropdown with an expandable permission list beneath it. */
export const VariantDisclosure = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <KeyFormShell projects={projects} draft={draft} setDraft={setDraft}>
      <Select
        value={draft.preset}
        onValueChange={(value) =>
          setDraft({ ...draft, preset: value as ApiKeyDraft["preset"] })
        }
      >
        <SelectTrigger className="h-auto" disableValueLineClamp>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((p) => {
            const Icon = presetIcons[p.key];
            return (
              <SelectItem
                key={p.key}
                value={p.key}
                className="pl-2 [&>span[data-checkmark]]:hidden"
              >
                <div className="flex items-start gap-2 text-left">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-bold">{p.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {p.description}
                    </span>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open && "rotate-90",
            )}
          />
          {open ? "Hide" : "View"} {rolePermissionCount(draft.preset)}{" "}
          permissions
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 overflow-hidden rounded-md border">
          <div className="max-h-80 overflow-y-auto p-4">
            <RolePermissionList preset={draft.preset} />
          </div>
          <SystemRolesFooter />
        </CollapsibleContent>
      </Collapsible>
    </KeyFormShell>
  );
};
