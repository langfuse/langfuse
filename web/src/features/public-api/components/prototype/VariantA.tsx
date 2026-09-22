// PROTOTYPE — throwaway. Variant A: guided stacked form, role dropdown + summary.

import { KeyRound } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
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
  resolvedPermissionIds,
} from "./permissionCatalog";
import { Textarea } from "@/src/components/ui/textarea";
import { ExpirySelect } from "./ExpirySelect";
import { PermissionMatrix } from "./PermissionMatrix";
import { ProjectMultiSelect } from "./ProjectMultiSelect";

export const variantAMeta = { key: "A", name: "Guided form + dropdown" };

export const VariantA = ({
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

  const changePreset = (preset: string) =>
    setDraft({
      ...draft,
      preset: preset as ApiKeyDraft["preset"],
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
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Create API key
        </CardTitle>
        <CardDescription>
          Scope the key to resources and grant a role.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
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
          <p className="text-muted-foreground text-xs">
            Defaults to all projects in the organization.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Role</Label>
          <Select value={draft.preset} onValueChange={changePreset}>
            <SelectTrigger className="h-auto" disableValueLineClamp>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => {
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
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label>Permissions</Label>
            <span className="text-muted-foreground text-xs">
              {granted.length} granted
            </span>
          </div>
          <PermissionMatrix
            granted={new Set(granted)}
            editable={isCustom}
            onToggle={toggleCustom}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="secondary">Cancel</Button>
        <Button disabled={draft.name.trim() === ""}>Create API key</Button>
      </CardFooter>
    </Card>
  );
};
