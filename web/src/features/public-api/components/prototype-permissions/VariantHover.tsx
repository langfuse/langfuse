// PROTOTYPE — throwaway. Variant A: role dropdown where each option reveals its
// full permission set in a hover card — a polished take on the membership hover.

import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
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

/** variantHoverMeta labels the hover-card variant in the switcher. */
export const variantHoverMeta = { key: "A", name: "Hover card per role" };

const roles = presets.filter((p) => p.key !== "custom");

/** VariantHover renders the role dropdown with a permission hover card on each option. */
export const VariantHover = ({
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
        {roles.map((p) => (
          <RoleOption key={p.key} preset={p.key} />
        ))}
      </SelectContent>
    </Select>
    <p className="text-muted-foreground text-xs">
      Hover a role to see exactly what it grants.
    </p>
  </KeyFormShell>
);

const RoleOption = ({ preset }: { preset: ApiKeyDraft["preset"] }) => {
  const meta = presets.find((p) => p.key === preset);
  const Icon = presetIcons[preset];
  if (!meta) return null;
  return (
    <HoverCard openDelay={80} closeDelay={40}>
      <HoverCardTrigger asChild>
        <SelectItem
          value={preset}
          className="pl-2 [&>span[data-checkmark]]:hidden"
        >
          <div className="flex items-start gap-2 text-left">
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold">{meta.label}</span>
              <span className="text-muted-foreground text-xs">
                {meta.description}
              </span>
            </div>
          </div>
        </SelectItem>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={12}
          avoidCollisions={false}
          className="w-80 p-0"
        >
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm font-bold">{meta.label}</span>
            <span className="text-muted-foreground ml-auto text-xs">
              {rolePermissionCount(preset)} permissions
            </span>
          </div>
          <ScrollArea className="max-h-80">
            <div className="px-4 py-3">
              <RolePermissionList preset={preset} dense />
            </div>
          </ScrollArea>
          <SystemRolesFooter />
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};
