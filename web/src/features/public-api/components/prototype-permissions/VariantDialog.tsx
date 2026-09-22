// PROTOTYPE — throwaway. Variant D: role dropdown plus a "View permissions" dialog
// that lets a curious user browse and compare every role's full permission set.

import { useState } from "react";

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
import {
  RolePermissionList,
  SystemRolesFooter,
  rolePermissionCount,
} from "./rolePermissions";

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
  const ActiveIcon = presetIcons[active];

  return (
    <DialogController
      size="lg"
      closeOnInteractionOutside={true}
      renderContent={() => (
        <>
          <DialogHeader>
            <DialogTitle>Permissions</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-3 flex items-center gap-2">
                <ActiveIcon className="h-4 w-4" />
                <span className="text-sm font-bold">
                  {presets.find((p) => p.key === active)?.label}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {rolePermissionCount(active)} permissions
                </span>
              </div>
              <ScrollArea className="max-h-96 pr-3">
                <RolePermissionList preset={active} />
              </ScrollArea>
            </div>
            <div className="flex w-44 shrink-0 flex-col gap-1 border-l pl-4">
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
                    {p.label}
                  </button>
                );
              })}
            </div>
          </DialogBody>
          <SystemRolesFooter />
        </>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground w-fit text-xs underline"
          >
            View permissions for each role
          </button>
        </Trigger>
      )}
    </DialogController>
  );
};
