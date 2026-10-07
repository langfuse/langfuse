import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useSession } from "next-auth/react";

import { type SystemRole } from "@langfuse/shared/src/db";
import {
  apiKeyRolesForScope,
  legacyApiKeyRoleForScope,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { Button } from "@/src/components/ui/button";
import {
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
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import {
  expiryPresetOptions,
  localDateInputValue,
  resolveExpiresAt,
  type ExpiryPreset,
} from "@/src/features/public-api/components/apiKeyFormOptions";

type ApiKeyScope = "project" | "organization";

const DEFAULT_ROLE: SystemRole = "ADMIN";

/** ApiKeyCreateValues is the resolved create-form payload the button forwards to the create mutation. */
export type ApiKeyCreateValues = {
  name: string;
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
  const { data: session } = useSession();
  const roleSelectionEnabled =
    session?.environment?.apiKeyRoleSelectionEnabled ?? false;

  const [name, setName] = useState("");
  const [role, setRole] = useState<SystemRole>(DEFAULT_ROLE);
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("never");
  const [customExpiry, setCustomExpiry] = useState("");
  const [roleSelectOpen, setRoleSelectOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<SystemRole | null>(
    null,
  );

  const expiresAt = resolveExpiresAt(expiryPreset, customExpiry);
  const submitDisabled = name.trim() === "" || expiresAt === undefined;

  const openPermissions = (target: SystemRole) => {
    setRoleSelectOpen(false);
    setPermissionsRole(target);
    setPermissionsOpen(true);
  };

  const submit = () => {
    if (submitDisabled) return;
    onSubmit({
      name: name.trim(),
      role: roleSelectionEnabled ? role : legacyApiKeyRoleForScope(scope),
      expiresAt,
    });
  };

  const selectedRoleDef = systemRoleAccessRights[role];
  const SelectedRoleIcon = roleIcons[role];

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
                  min={localDateInputValue(new Date())}
                  value={customExpiry}
                  onChange={(e) => setCustomExpiry(e.target.value)}
                />
              )}
            </div>
          </div>

          {roleSelectionEnabled && (
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
                    <SelectedRoleIcon className="icon-base mt-0.5 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold">{selectedRoleDef.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {selectedRoleDef.description}
                      </span>
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <RoleSelectItem
                      key={r}
                      role={r}
                      onViewPermissions={openPermissions}
                    />
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => {
                  setPermissionsRole(role);
                  setPermissionsOpen(true);
                }}
                className="text-muted-foreground hover:text-foreground ml-1 w-fit text-xs"
              >
                View{" "}
                <span className="inline-flex items-center gap-0.5 underline">
                  {rolePermissionCountLabel(role)}
                  <ArrowUpRight className="icon-sm" />
                </span>
              </button>
            </div>
          )}
        </div>

        {roleSelectionEnabled && (
          <RolePermissionPopup
            open={permissionsOpen}
            onOpenChange={setPermissionsOpen}
            role={permissionsRole}
          />
        )}
      </DialogBody>
      <DialogFooter>
        <Button onClick={submit} loading={isPending} disabled={submitDisabled}>
          Create API key
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
