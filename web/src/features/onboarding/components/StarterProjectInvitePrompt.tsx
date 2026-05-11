import { useEffect, useState } from "react";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useQueryProject } from "@/src/features/projects/hooks";
import { CreateProjectMemberButton } from "@/src/features/rbac/components/CreateProjectMemberButton";
import {
  STARTER_PROJECT_INVITE_PROMPT_STORAGE_KEY,
  type StarterProjectInvitePrompt,
} from "@/src/features/onboarding/lib/starterProjectInvitePrompt";

export function StarterProjectInvitePrompt() {
  const { project, organization } = useQueryProject();
  const [invitePrompt, , clearInvitePrompt] =
    useLocalStorage<StarterProjectInvitePrompt | null>(
      STARTER_PROJECT_INVITE_PROMPT_STORAGE_KEY,
      null,
    );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (invitePrompt?.projectId && invitePrompt.projectId === project?.id) {
      setOpen(true);
    }
  }, [invitePrompt?.projectId, project?.id]);

  if (!project || !organization) {
    return null;
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      clearInvitePrompt();
    }
  };

  return (
    <CreateProjectMemberButton
      orgId={organization.id}
      project={{ id: project.id, name: project.name }}
      open={open}
      onOpenChange={handleOpenChange}
      hideTrigger
      dialogTitle="Invite your colleagues to collaborate - it's free!"
      showRoleScopeDetails={false}
    />
  );
}
