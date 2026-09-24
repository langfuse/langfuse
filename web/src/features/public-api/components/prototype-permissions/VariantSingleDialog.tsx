// PROTOTYPE — throwaway. Variant E: role dropdown where each option has a
// permission-count button that opens a popup of that role's permission list.

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  type ApiKeyDraft,
  type PresetKey,
  type ProjectOption,
  presetIcons,
} from "../prototype/permissionCatalog";
import { KeyFormShell } from "./KeyFormShell";
import {
  RolePermissionList,
  presets,
  rolePermissionCount,
} from "./rolePermissions";

/** variantSingleDialogMeta labels the single-role popup variant in the switcher. */
export const variantSingleDialogMeta = { key: "E", name: "Single-role popup" };

const roles = presets.filter((p) => p.key !== "custom");

/** VariantSingleDialog renders the role dropdown with a per-role permission popup. */
export const VariantSingleDialog = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => {
  const [selectOpen, setSelectOpen] = useState(false);
  const [popupRole, setPopupRole] = useState<PresetKey | null>(null);

  const openPopup = (role: PresetKey) => {
    setSelectOpen(false);
    setPopupRole(role);
  };

  return (
    <KeyFormShell projects={projects} draft={draft} setDraft={setDraft}>
      <Select
        open={selectOpen}
        onOpenChange={setSelectOpen}
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
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openPopup(p.key);
                    }}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground ml-auto flex shrink-0 items-center gap-1.5 self-center rounded-md px-1.5 py-1"
                  >
                    <Badge
                      variant="tertiary"
                      className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                    >
                      {rolePermissionCount(p.key)}
                    </Badge>
                    <span className="text-[0.65rem] font-bold tracking-wider uppercase">
                      Permissions
                    </span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <PermissionsPopup role={popupRole} onClose={() => setPopupRole(null)} />
    </KeyFormShell>
  );
};

const PermissionsPopup = ({
  role,
  onClose,
}: {
  role: PresetKey | null;
  onClose: () => void;
}) => {
  const meta = role ? presets.find((p) => p.key === role) : undefined;
  const Icon = role ? presetIcons[role] : undefined;

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="default" className="max-w-[25.6rem]">
        {role && meta && Icon && (
          <>
            <DialogHeader variant="action">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Icon className="mt-px h-4 w-4 shrink-0" />
                <span>{meta.label} Permissions</span>
                <Badge
                  variant="tertiary"
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                >
                  {rolePermissionCount(role)}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="p-0">
              <div className="max-h-[70vh] overflow-y-auto px-5 pb-10">
                <RolePermissionList preset={role} />
              </div>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
