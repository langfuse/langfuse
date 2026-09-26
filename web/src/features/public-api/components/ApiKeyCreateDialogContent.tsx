import React, { useState } from "react";
import { ArrowUpRight, SquareArrowOutUpRight } from "lucide-react";

import { type SystemRole } from "@langfuse/shared/src/db";
import {
  apiKeyRolesForScope,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { ApiKeyDetailContent } from "@/src/features/public-api/components/ApiKeyDetailContent";
import {
  RolePermissionList,
  rolePermissionCount,
  rolePermissionCountLabel,
  rolePermissionNoun,
} from "@/src/features/public-api/components/RolePermissionList";
import {
  apiKeyRoleIcons,
  expiryPresetOptions,
  resolveExpiresAt,
  type ExpiryPreset,
} from "@/src/features/public-api/components/apiKeyFormOptions";

type ApiKeyScope = "project" | "organization";

const DEFAULT_ROLE: SystemRole = "ADMIN";

/** ApiKeyCreateValues is the resolved create-form payload the button forwards to the create mutation. */
export type ApiKeyCreateValues = {
  note: string;
  role: SystemRole;
  expiresAt: Date | null;
};

export type ApiKeyCreateDialogContentProps =
  | {
      scope: ApiKeyScope;
      type: "form";
      onSubmit: (values: ApiKeyCreateValues) => void;
      isPending?: boolean;
    }
  | (Omit<
      React.ComponentProps<typeof ApiKeyDetailContent>,
      "showMcpSection"
    > & {
      type: "detail";
    });

export function ApiKeyCreateDialogContent(
  props: ApiKeyCreateDialogContentProps,
) {
  const { scope } = props;

  if (props.type === "detail") {
    const { secretKey, publicKey, baseUrl } = props;

    return (
      <DialogContent closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ApiKeyDetailContent
            scope={scope}
            secretKey={secretKey}
            publicKey={publicKey}
            baseUrl={baseUrl}
            showMcpSection={true}
          />
        </DialogBody>
      </DialogContent>
    );
  }

  return <ApiKeyCreateForm {...props} />;
}

function ApiKeyCreateForm({
  scope,
  onSubmit,
  isPending,
}: Extract<ApiKeyCreateDialogContentProps, { type: "form" }>) {
  const roles = apiKeyRolesForScope(scope);

  const [name, setName] = useState("");
  const [role, setRole] = useState<SystemRole>(DEFAULT_ROLE);
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("never");
  const [customExpiry, setCustomExpiry] = useState("");
  const [roleSelectOpen, setRoleSelectOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<SystemRole | null>(
    null,
  );

  const submitDisabled = name.trim() === "";

  const openPermissions = (target: SystemRole) => {
    setRoleSelectOpen(false);
    setPermissionsRole(target);
  };

  const submit = () => {
    if (submitDisabled) return;
    onSubmit({
      note: name.trim(),
      role,
      expiresAt: resolveExpiresAt(expiryPreset, customExpiry),
    });
  };

  const selectedRoleDef = systemRoleAccessRights[role];
  const SelectedRoleIcon = apiKeyRoleIcons[role];

  return (
    <DialogContent closeOnInteractionOutside>
      <DialogHeader>
        <DialogTitle>Create API key</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKeyName">Name</Label>
            <Input
              id="apiKeyName"
              placeholder="e.g. Production server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKeyExpiry">Expiration</Label>
            <div className={expiryPreset === "custom" ? "flex gap-2" : ""}>
              <Select
                value={expiryPreset}
                onValueChange={(value) =>
                  setExpiryPreset(value as ExpiryPreset)
                }
              >
                <SelectTrigger id="apiKeyExpiry" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expiryPresetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {expiryPreset === "custom" && (
                <Input
                  type="date"
                  aria-label="Custom expiration date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Permissions</Label>
            <Select
              open={roleSelectOpen}
              onOpenChange={setRoleSelectOpen}
              value={role}
              onValueChange={(value) => setRole(value as SystemRole)}
            >
              <SelectTrigger className="h-auto" disableValueLineClamp>
                <div className="flex items-start gap-2 text-left">
                  <SelectedRoleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-bold">{selectedRoleDef.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {selectedRoleDef.description}
                    </span>
                  </div>
                </div>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => {
                  const def = systemRoleAccessRights[r];
                  const Icon = apiKeyRoleIcons[r];
                  return (
                    <SelectItem
                      key={r}
                      value={r}
                      className="group pl-2 [&>span:not([data-checkmark])]:flex-1 [&>span[data-checkmark]]:hidden"
                    >
                      <div className="flex w-full items-start gap-2 text-left">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex flex-col">
                          <span className="font-bold">{def.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {def.description}
                          </span>
                        </div>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openPermissions(r);
                          }}
                          aria-label={`View ${def.name} permissions`}
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
              onClick={() => setPermissionsRole(role)}
              className="text-muted-foreground hover:text-foreground ml-1 w-fit text-xs"
            >
              View{" "}
              <span className="inline-flex items-center gap-0.5 underline">
                {rolePermissionCountLabel(role)}
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </button>
          </div>
        </div>

        <PermissionsPopup
          role={permissionsRole}
          onClose={() => setPermissionsRole(null)}
        />
      </DialogBody>
      <DialogFooter>
        <Button onClick={submit} loading={isPending} disabled={submitDisabled}>
          Create API key
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PermissionsPopup({
  role,
  onClose,
}: {
  role: SystemRole | null;
  onClose: () => void;
}) {
  const def = role ? systemRoleAccessRights[role] : undefined;
  const Icon = role ? apiKeyRoleIcons[role] : undefined;

  return (
    <Dialog open={role !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {role && def && Icon && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{def.name}</span>
                <Badge
                  variant="tertiary"
                  className="ml-1 shrink-0 text-[0.7rem] uppercase tabular-nums"
                >
                  <span className="font-bold">{rolePermissionCount(role)}</span>{" "}
                  {rolePermissionNoun(role)}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="p-0">
              <RolePermissionList role={role} />
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
