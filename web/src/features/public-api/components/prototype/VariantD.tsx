// PROTOTYPE — throwaway. Variant D: GitHub fine-grained style, add-only permission list.

import { Plus, X } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { PopoverController } from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  type ApiKeyDraft,
  type PermissionKind,
  type ProjectOption,
  describeResource,
  kindsForDomain,
  permissionCatalog,
  permissionDomains,
  permissionId,
  presetIcons,
  presets,
  resolvedPermissionIds,
} from "./permissionCatalog";
import { Textarea } from "@/src/components/ui/textarea";
import { ExpirySelect } from "./ExpirySelect";
import { ProjectMultiSelect } from "./ProjectMultiSelect";

type AccessLevel = "none" | "read" | "write" | "readwrite";

export const variantDMeta = { key: "D", name: "GitHub fine-grained style" };

export const VariantD = ({
  projects,
  draft,
  setDraft,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
}) => {
  const granted = new Set(resolvedPermissionIds(draft));
  const grantedKinds = permissionCatalog.filter(
    (k) => levelOf(k, granted) !== "none",
  );
  const availableByDomain = permissionDomains
    .map((domain) => ({
      domain,
      kinds: kindsForDomain(domain.key).filter(
        (k) => levelOf(k, granted) === "none",
      ),
    }))
    .filter((g) => g.kinds.length > 0);

  const changePreset = (preset: string) =>
    setDraft({
      ...draft,
      preset: preset as ApiKeyDraft["preset"],
      customIds: preset === "custom" ? [] : draft.customIds,
    });

  const setLevel = (kind: PermissionKind, level: AccessLevel) => {
    const next = new Set(resolvedPermissionIds(draft));
    for (const a of kind.actions)
      next.delete(permissionId(kind.domain, kind.resource, a));
    const grant = (predicate: (a: string) => boolean) => {
      for (const a of kind.actions)
        if (predicate(a)) next.add(permissionId(kind.domain, kind.resource, a));
    };
    if (level === "read") grant((a) => a === "read");
    if (level === "write") grant((a) => a !== "read");
    if (level === "readwrite") grant(() => true);
    setDraft({ ...draft, preset: "custom", customIds: [...next] });
  };

  return (
    <div className="bg-muted flex justify-center rounded-lg border p-6 sm:p-10">
      <Card className="w-full max-w-[33.05rem] shadow-2xl">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>Create a new API key</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-1 h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="This name will be used to identify the key in your account."
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
          <div className="flex flex-col gap-1.5">
            <Label>Permissions</Label>
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

          <div className="overflow-hidden rounded-md border">
            <div className="bg-muted/50 flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-bold">
                Permissions
                {grantedKinds.length > 0 && (
                  <Badge size="sm" className="rounded-full">
                    {grantedKinds.length}
                  </Badge>
                )}
              </span>
              <AddPermission available={availableByDomain} onAdd={setLevel} />
            </div>
            <div className="bg-card max-h-[12.25rem] overflow-y-auto">
              {grantedKinds.length === 0 ? (
                <div className="text-muted-foreground px-3 py-10 text-center text-sm">
                  No permissions yet. Use “Add permission”.
                </div>
              ) : (
                <div className="divide-y">
                  {grantedKinds.map((kind) => (
                    <PermissionRow
                      key={`${kind.domain}:${kind.resource}`}
                      kind={kind}
                      level={levelOf(kind, granted)}
                      onChange={(level) => setLevel(kind, level)}
                      onRemove={() => setLevel(kind, "none")}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="secondary">Cancel</Button>
          <Button disabled={draft.name.trim() === ""}>Create API key</Button>
        </CardFooter>
      </Card>
    </div>
  );
};

const PermissionRow = ({
  kind,
  level,
  onChange,
  onRemove,
}: {
  kind: PermissionKind;
  level: AccessLevel;
  onChange: (level: AccessLevel) => void;
  onRemove: () => void;
}) => (
  <div className="flex h-14 items-center justify-between gap-3 px-3">
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-2 text-sm font-bold">
        {kind.label}
        <Badge
          size="sm"
          className={cn(
            "border-transparent font-normal",
            kind.domain === "organization"
              ? "bg-light-blue text-dark-blue"
              : "bg-light-violet text-dark-violet",
          )}
        >
          {domainLabel(kind)}
        </Badge>
      </span>
      <span
        className="text-muted-foreground truncate text-xs"
        title={describeResource(kind.resource)}
      >
        {describeResource(kind.resource)}
      </span>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <Select value={level} onValueChange={(v) => onChange(v as AccessLevel)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {hasRead(kind) && <SelectItem value="read">Read only</SelectItem>}
          {hasWrite(kind) && <SelectItem value="write">Write only</SelectItem>}
          {hasRead(kind) && hasWrite(kind) && (
            <SelectItem value="readwrite">Read and write</SelectItem>
          )}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const AddPermission = ({
  available,
  onAdd,
}: {
  available: {
    domain: { key: string; label: string };
    kinds: PermissionKind[];
  }[];
  onAdd: (kind: PermissionKind, level: AccessLevel) => void;
}) => (
  <PopoverController
    align="end"
    modal={false}
    disabled={available.length === 0}
    contentClassName="w-80 p-0"
    renderContent={({ closePopover }) => (
      <Command>
        <CommandInput placeholder="Add permission…" />
        <CommandList>
          <CommandEmpty>No permissions left to add.</CommandEmpty>
          {available.map((group) => (
            <CommandGroup key={group.domain.key} heading={group.domain.label}>
              {group.kinds.map((kind) => (
                <CommandItem
                  key={`${kind.domain}:${kind.resource}`}
                  value={`${group.domain.label} ${kind.label} ${describeResource(kind.resource)}`}
                  onSelect={() => {
                    onAdd(kind, hasRead(kind) ? "read" : "write");
                    closePopover();
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{kind.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {describeResource(kind.resource)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    )}
  >
    {({ Trigger }) => (
      <Trigger asChild>
        <Button variant="outline" size="sm" disabled={available.length === 0}>
          <Plus className="mr-1 h-4 w-4" /> Add permission
        </Button>
      </Trigger>
    )}
  </PopoverController>
);

const domainLabel = (kind: PermissionKind): string =>
  permissionDomains.find((d) => d.key === kind.domain)?.label ?? "";

const hasRead = (kind: PermissionKind): boolean =>
  kind.actions.includes("read");

const hasWrite = (kind: PermissionKind): boolean =>
  kind.actions.some((a) => a !== "read");

const levelOf = (kind: PermissionKind, granted: Set<string>): AccessLevel => {
  const on = kind.actions.filter((a) =>
    granted.has(permissionId(kind.domain, kind.resource, a)),
  );
  if (on.length === 0) return "none";
  const read = on.includes("read");
  const write = on.some((a) => a !== "read");
  if (read && write) return "readwrite";
  if (read) return "read";
  return "write";
};
