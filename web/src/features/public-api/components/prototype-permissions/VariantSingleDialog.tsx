// PROTOTYPE — throwaway. Variant E: role dropdown showing each role's permission
// count, with a "View N permissions" link below opening a popup for the role.

import { useState } from "react";
import { ChevronRight, SquareArrowOutUpRight } from "lucide-react";

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

  const selected = presets.find((p) => p.key === draft.preset);
  const SelectedIcon = presetIcons[draft.preset];

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
          <div className="flex items-start gap-2 text-left">
            <SelectedIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold">{selected?.label}</span>
              <span className="text-muted-foreground text-xs">
                {selected?.description}
              </span>
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          {roles.map((p) => {
            const Icon = presetIcons[p.key];
            return (
              <SelectItem
                key={p.key}
                value={p.key}
                className="group pl-2 [&>span:not([data-checkmark])]:flex-1 [&>span[data-checkmark]]:hidden"
              >
                <div className="flex w-full items-start gap-2 text-left">
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
                    aria-label={`View ${p.label} permissions`}
                    className="text-muted-foreground hover:bg-background hover:text-foreground ml-auto flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full opacity-0 group-hover:opacity-100 group-data-highlighted:opacity-100 focus-visible:opacity-100"
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => setPopupRole(draft.preset)}
        className="text-muted-foreground hover:text-foreground ml-1 w-fit text-xs"
      >
        View{" "}
        <span className="inline-flex items-center gap-0.5 underline">
          {rolePermissionCount(draft.preset)} permissions
          <ChevronRight className="h-3 w-3" />
        </span>
      </button>
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
                <span>{meta.label}</span>
                <Badge
                  variant="tertiary"
                  className="ml-1 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                >
                  {rolePermissionCount(role)} Permissions
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
