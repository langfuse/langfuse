// PROTOTYPE — throwaway. Variant B: split pane, role radio cards + live matrix.

import { Check } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";
import {
  type ApiKeyDraft,
  type ProjectOption,
  presets,
  resolvedPermissionIds,
} from "./permissionCatalog";
import { Textarea } from "@/src/components/ui/textarea";
import { ExpirySelect } from "./ExpirySelect";
import { PermissionMatrix } from "./PermissionMatrix";
import { ProjectMultiSelect } from "./ProjectMultiSelect";

export const variantBMeta = { key: "B", name: "Split pane + matrix" };

export const VariantB = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => {
  const isCustom = draft.preset === "custom";
  const granted = new Set(resolvedPermissionIds(draft));

  const changePreset = (preset: ApiKeyDraft["preset"]) =>
    setDraft({
      ...draft,
      preset,
      customIds: preset === "custom" ? [] : draft.customIds,
    });

  const toggleCustom = (id: string) =>
    setDraft({
      ...draft,
      customIds: draft.customIds.includes(id)
        ? draft.customIds.filter((x) => x !== id)
        : [...draft.customIds, id],
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
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
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="What is this key used for?"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
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
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => changePreset(p.key)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  draft.preset === p.key
                    ? "border-primary bg-accent"
                    : "hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{p.label}</span>
                  {draft.preset === p.key && <Check className="h-4 w-4" />}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {p.description}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold">Permissions</span>
            <span className="text-muted-foreground text-xs">
              {isCustom
                ? "Toggle any cell"
                : `Inherited from ${presets.find((p) => p.key === draft.preset)?.label}`}
            </span>
          </div>
          <PermissionMatrix
            granted={granted}
            editable={isCustom}
            onToggle={toggleCustom}
          />
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2 lg:col-span-2">
        <Button variant="secondary">Cancel</Button>
        <Button disabled={draft.name.trim() === ""}>Create API key</Button>
      </div>
    </div>
  );
};
