// PROTOTYPE — throwaway. Variant C: role gallery cards + inline permission panel.

import { KeyRound, type LucideIcon } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";
import {
  type ApiKeyDraft,
  type PresetKey,
  type ProjectOption,
  groupByKind,
  kindsForDomain,
  permissionDomains,
  permissionId,
  presetIcons,
  presets,
  resolvedPermissionIds,
} from "./permissionCatalog";
import { Textarea } from "@/src/components/ui/textarea";
import { ExpirySelect } from "./ExpirySelect";
import { ProjectMultiSelect } from "./ProjectMultiSelect";

export const variantCMeta = { key: "C", name: "Role gallery cards" };

export const VariantC = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => {
  const isCustom = draft.preset === "custom";
  const granted = resolvedPermissionIds(draft);

  const changePreset = (preset: PresetKey) =>
    setDraft({
      ...draft,
      preset,
      customIds: preset === "custom" ? [] : draft.customIds,
    });

  const toggleCustom = (ids: string[]) =>
    setDraft({ ...draft, customIds: ids });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-2 text-lg font-bold">
        <KeyRound className="h-5 w-5" /> Create API key
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Production key"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Expiration</Label>
          <ExpirySelect
            expiry={draft.expiry}
            customExpiry={draft.customExpiry}
            onChange={(next) => setDraft({ ...draft, ...next })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Resources</Label>
          <ProjectMultiSelect
            projects={projects}
            allProjects={draft.allProjects}
            projectIds={draft.projectIds}
            onChange={(next) => setDraft({ ...draft, ...next })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          placeholder="What is this key used for?"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Choose a role</Label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <RoleCard
              key={p.key}
              icon={presetIcons[p.key]}
              label={p.label}
              description={p.description}
              selected={draft.preset === p.key}
              onSelect={() => changePreset(p.key)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        {isCustom ? (
          <CustomCatalog customIds={draft.customIds} onChange={toggleCustom} />
        ) : (
          <PermissionChips ids={granted} />
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary">Cancel</Button>
        <Button disabled={draft.name.trim() === ""}>Create API key</Button>
      </div>
    </div>
  );
};

const RoleCard = ({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      "flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
      selected
        ? "border-primary ring-primary/30 bg-accent ring-2"
        : "hover:border-primary/40 hover:bg-muted/40",
    )}
  >
    <Icon className="h-5 w-5" />
    <span className="text-sm font-bold">{label}</span>
    <span className="text-muted-foreground text-xs">{description}</span>
  </button>
);

const PermissionChips = ({ ids }: { ids: string[] }) => {
  const groups = groupByKind(ids);
  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-bold">Included permissions</span>
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          No permissions selected.
        </p>
      ) : (
        permissionDomains.map((domain) => {
          const domainGroups = groups.filter(
            (g) => g.kind.domain === domain.key,
          );
          if (domainGroups.length === 0) return null;
          return (
            <div key={domain.key} className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
                {domain.label}
              </span>
              {domainGroups.map(({ kind, actions }) => (
                <div key={kind.resource} className="flex items-baseline gap-3">
                  <span className="w-40 shrink-0 text-sm font-bold">
                    {kind.label}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {actions.map((a) => (
                      <Badge key={a} variant="outline" className="font-normal">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
};

const CustomCatalog = ({
  customIds,
  onChange,
}: {
  customIds: string[];
  onChange: (ids: string[]) => void;
}) => {
  const selected = new Set(customIds);

  const setKind = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange([...next]);
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="flex flex-col gap-6">
      <span className="text-sm font-bold">Custom permissions</span>
      {permissionDomains.map((domain) => (
        <div key={domain.key} className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            {domain.label}
          </span>
          <div className="grid gap-4 sm:grid-cols-2">
            {kindsForDomain(domain.key).map((kind) => {
              const ids = kind.actions.map((a) =>
                permissionId(kind.domain, kind.resource, a),
              );
              const on = ids.filter((id) => selected.has(id));
              const kindState =
                on.length === 0
                  ? false
                  : on.length === ids.length
                    ? true
                    : "indeterminate";
              return (
                <div key={kind.resource} className="rounded-md border p-3">
                  <label className="flex cursor-pointer items-center gap-2 border-b pb-2 text-sm font-bold">
                    <Checkbox
                      checked={kindState}
                      onCheckedChange={(c) => setKind(ids, c === true)}
                    />
                    {kind.label}
                  </label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                    {kind.actions.map((a) => {
                      const id = permissionId(kind.domain, kind.resource, a);
                      return (
                        <label
                          key={a}
                          className="flex cursor-pointer items-center gap-1.5 text-sm"
                        >
                          <Checkbox
                            size="sm"
                            checked={selected.has(id)}
                            onCheckedChange={() => toggle(id)}
                          />
                          {a}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
