// PROTOTYPE — throwaway. Variant D: role dropdown plus a "View permissions" dialog
// that lets a curious user browse and compare every role's full permission set.

import { useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import {
  DialogBody,
  DialogController,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ScrollArea } from "@/src/components/ui/scroll-area";
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
  type PresetKey,
  type ProjectOption,
  presetIcons,
  presets,
} from "../prototype/permissionCatalog";
import { KeyFormShell } from "./KeyFormShell";
import { RolePermissionList, rolePermissionCount } from "./rolePermissions";

/** variantDialogMeta labels the dialog variant in the switcher. */
export const variantDialogMeta = { key: "D", name: "Compare in dialog" };

const roles = presets.filter((p) => p.key !== "custom");

/** VariantDialog renders the role dropdown with a dialog for browsing role permissions. */
export const VariantDialog = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => (
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
    <PermissionsDialog initial={draft.preset} />
  </KeyFormShell>
);

const PermissionsDialog = ({ initial }: { initial: PresetKey }) => {
  const [active, setActive] = useState<PresetKey>(initial);

  return (
    <DialogController
      size="lg"
      closeOnInteractionOutside={true}
      renderContent={() => (
        <>
          <DialogHeader>
            <DialogTitle>Permissions</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex min-h-0 flex-1 gap-4">
              <div className="flex w-56 shrink-0 flex-col gap-1 border-r pr-4">
                {roles.map((p) => {
                  const Icon = presetIcons[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setActive(p.key)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        active === p.key
                          ? "bg-accent font-bold"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate" title={p.label}>
                        {p.label}
                      </span>
                      <Badge
                        variant="secondary"
                        className="shrink-0 px-1.5 py-0 font-normal tabular-nums"
                      >
                        {rolePermissionCount(p.key)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <ScrollArea className="min-h-0 min-w-0 flex-1 pr-3">
                <RolePermissionList preset={active} />
              </ScrollArea>
            </div>
          </DialogBody>
        </>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            onClick={() => setActive(initial)}
            className="text-muted-foreground w-fit text-xs"
          >
            See the{" "}
            <span className="hover:text-foreground underline">
              full list of permissions
            </span>
          </button>
        </Trigger>
      )}
    </DialogController>
  );
};
