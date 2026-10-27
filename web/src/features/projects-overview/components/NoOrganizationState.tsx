import { BookOpen, Plus } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { createOrganizationRoute } from "@/src/features/setup";

/** The overview of a user who is not a member of any organization yet. */
export function NoOrganizationState({
  canCreateOrganizations,
}: {
  canCreateOrganizations: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-8">
      <p className="text-base font-bold">
        You are not part of an organization yet
      </p>
      <p className="text-muted-foreground max-w-prose text-sm">
        {canCreateOrganizations
          ? "Organizations group your projects and team. Create one to set up your first project, or ask a teammate to invite you to theirs."
          : "Ask an admin of your team to invite you to their organization. You will see its projects here once you are a member."}
      </p>
      <div className="flex flex-wrap gap-2">
        {canCreateOrganizations ? (
          <Button
            href={createOrganizationRoute}
            text="Create organization"
            icon={Plus}
          />
        ) : null}
        <Button
          href="https://langfuse.com/docs"
          text="Read the docs"
          icon={BookOpen}
          variant="outline"
        />
      </div>
    </div>
  );
}
