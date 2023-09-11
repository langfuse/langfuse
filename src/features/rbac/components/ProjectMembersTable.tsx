import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import { TrashIcon } from "lucide-react";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { CreateProjectMemberButton } from "@/src/features/rbac/components/CreateProjectMemberButton";

export function ProjectMembersTable({ projectId }: { projectId: string }) {
  const hasReadAccess = useHasAccess({
    projectId: projectId,
    scope: "members:read",
  });
  const hasDeleteAccess = useHasAccess({
    projectId: projectId,
    scope: "members:delete",
  });

  const utils = api.useContext();
  const memberships = api.projectMembers.get.useQuery(
    {
      projectId: projectId,
    },
    {
      enabled: hasReadAccess,
    },
  );
  const mutDeleteMembership = api.projectMembers.delete.useMutation({
    onSuccess: () => utils.projectMembers.invalidate(),
  });

  if (!hasReadAccess) return null;

  return (
    <div>
      <h2 className="mb-5 text-base font-semibold leading-6 text-gray-900">
        Project Members
      </h2>
      <Card className="mb-4">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="text-gray-900">Name</TableHead>
              <TableHead className="text-gray-900">Email</TableHead>
              <TableHead className="text-gray-900">Role</TableHead>
              {hasDeleteAccess ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody className="text-gray-500">
            {memberships.data?.map((m) => (
              <TableRow key={m.userId} className="hover:bg-transparent">
                <TableCell>{m.user.name}</TableCell>
                <TableCell>{m.user.email}</TableCell>
                <TableCell>{m.role}</TableCell>
                {hasDeleteAccess && m.role !== "OWNER" ? (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="xs"
                      loading={mutDeleteMembership.isLoading}
                      onClick={() => {
                        mutDeleteMembership.mutate({
                          projectId: projectId,
                          userId: m.user.id,
                        });
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <CreateProjectMemberButton projectId={projectId} />
    </div>
  );
}
