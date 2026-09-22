// PROTOTYPE — throwaway. Create-key form scaffold shared by the permission-view
// variants; each variant supplies its own Permissions control as children.

import { type ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { ExpirySelect } from "../prototype/ExpirySelect";
import { ProjectMultiSelect } from "../prototype/ProjectMultiSelect";
import {
  type ApiKeyDraft,
  type ProjectOption,
} from "../prototype/permissionCatalog";
import { SystemRolesFootnote } from "./rolePermissions";

/** KeyFormShell renders the standard create-key fields and slots a variant's permissions control. */
export const KeyFormShell = ({
  projects,
  draft,
  setDraft,
  children,
}: {
  projects: ProjectOption[];
  draft: ApiKeyDraft;
  setDraft: (draft: ApiKeyDraft) => void;
  children: ReactNode;
}) => (
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
          {children}
          <div className="mt-1">
            <SystemRolesFootnote />
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
