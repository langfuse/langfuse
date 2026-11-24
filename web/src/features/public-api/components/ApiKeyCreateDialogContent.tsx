/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import React, { useState } from "react";
import { useSession } from "next-auth/react";

import { type SystemRole } from "@langfuse/shared/src/db";
import { apiKeyRolesForScope } from "@langfuse/shared/rbac";

import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { withoutGatewayRole } from "@/src/features/ai-gateway/fns/separateGatewayApiKeys";
import { ApiKeyExpirationInput } from "@/src/features/apiKey/components/ApiKeyExpirationInput/ApiKeyExpirationInput";
import type { ApiKeyExpirationPreset } from "@/src/features/apiKey/constants/apiKeyExpirationOptions";
import { resolveApiKeyExpiration } from "@/src/features/apiKey/fns/resolveApiKeyExpiration";
import { ApiKeyDetailContent } from "@/src/features/public-api/components/ApiKeyDetailContent";
import {
  roleDisplay,
  type RoleDisplay,
} from "@/src/features/rbac/components/roleDisplay";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";

type ApiKeyScope = "project" | "organization";

const DEFAULT_ROLE: SystemRole = "MEMBER";

/** apiKeyRoleOrder lists the roles shown first in the picker; the rest follow in catalog order. */
const apiKeyRoleOrder: SystemRole[] = ["ADMIN", "VIEWER", "MEMBER"];

/** apiKeyRoleOverrides presents user roles in api-key friendly terms. */
const apiKeyRoleOverrides: Partial<Record<SystemRole, Partial<RoleDisplay>>> = {
  ADMIN: { name: "Full access" },
  MEMBER: {
    name: "Developer",
    description:
      "Debug traces, build datasets and run experiments from the SDK.",
  },
};

/** ApiKeyCreateValues is the resolved create-form payload the button forwards to the create mutation. */
export type ApiKeyCreateValues = {
  name: string;
  role?: SystemRole;
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
      <DialogContent>
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
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
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
  const roles = sortApiKeyRoles(withoutGatewayRole(apiKeyRolesForScope(scope)));
  const { data: session } = useSession();
  const roleSelectionEnabled =
    (scope === "project"
      ? session?.environment?.apiKeyProjectRoleSelectionEnabled
      : session?.environment?.apiKeyOrgRoleSelectionEnabled) ?? false;

  const [name, setName] = useState("");
  const [role, setRole] = useState<SystemRole>(DEFAULT_ROLE);
  const [expiryPreset, setExpiryPreset] =
    useState<ApiKeyExpirationPreset>("never");
  const [customExpiry, setCustomExpiry] = useState("");

  const expiresAt = resolveApiKeyExpiration(expiryPreset, customExpiry);
  const submitDisabled = name.trim() === "" || expiresAt === undefined;

  const submit = () => {
    if (submitDisabled) return;
    onSubmit({
      name: name.trim(),
      ...(roleSelectionEnabled ? { role } : {}),
      expiresAt,
    });
  };

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

          <ApiKeyExpirationInput
            id="apiKeyExpiry"
            expiryPreset={expiryPreset}
            customExpiry={customExpiry}
            onExpiryPresetChange={setExpiryPreset}
            onCustomExpiryChange={setCustomExpiry}
          />

          {roleSelectionEnabled && (
            <div className="flex flex-col gap-1.5">
              <Label>Permissions</Label>
              <RoleSelect
                variant="detailed"
                menu="trigger"
                roles={roles}
                value={role}
                onValueChange={setRole}
                display={apiKeyRoleDisplay}
              />
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={submit} loading={isPending} disabled={submitDisabled}>
          Create API key
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** apiKeyRoleDisplay presents a role with its api-key overrides applied. */
function apiKeyRoleDisplay(role: SystemRole): RoleDisplay {
  return { ...roleDisplay(role), ...apiKeyRoleOverrides[role] };
}

/** sortApiKeyRoles puts apiKeyRoleOrder roles first, keeping catalog order for the rest. */
function sortApiKeyRoles(roles: SystemRole[]): SystemRole[] {
  const rank = (role: SystemRole) => {
    const index = apiKeyRoleOrder.indexOf(role);
    if (index === -1) return apiKeyRoleOrder.length;
    return index;
  };
  return [...roles].sort((a, b) => rank(a) - rank(b));
}
