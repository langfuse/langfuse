// PROTOTYPE — throwaway. Variant E: role dropdown whose "View N permissions"
// link opens a popup showing the selected role's nested permission list.

import { Badge } from "@/src/components/ui/badge";
import {
  DialogBody,
  DialogController,
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

/** VariantSingleDialog renders the role dropdown with a popup for the selected role's permissions. */
export const VariantSingleDialog = ({
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
    <PermissionsDialog preset={draft.preset} />
  </KeyFormShell>
);

const PermissionsDialog = ({ preset }: { preset: PresetKey }) => {
  const meta = presets.find((p) => p.key === preset);
  const Icon = presetIcons[preset];
  if (!meta) return null;
  return (
    <DialogController
      size="default"
      className="max-w-[25.6rem]"
      closeOnInteractionOutside={true}
      renderContent={() => (
        <>
          <DialogHeader variant="action">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{meta.label} Permissions</span>
              <Badge
                variant="secondary"
                className="bg-foreground text-background shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
              >
                {rolePermissionCount(preset)}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="p-0">
            <div className="max-h-[70vh] overflow-y-auto px-5 pb-4">
              <RolePermissionList preset={preset} />
            </div>
          </DialogBody>
        </>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground w-fit text-xs underline"
          >
            View {rolePermissionCount(preset)} permissions
          </button>
        </Trigger>
      )}
    </DialogController>
  );
};
