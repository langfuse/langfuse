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
import { useSession } from "next-auth/react";
import Header from "@/src/components/layouts/header";

export function ProjectMembersTable({ projectId }: { projectId: string }) {
  const hasReadAccess = useHasAccess({
    projectId: projectId,
    scope: "members:read",
  });
  const hasDeleteAccess = useHasAccess({
    projectId: projectId,
    scope: "members:delete",
  });

  const session = useSession();

  const utils = api.useUtils();
  const data = api.projectMembers.get.useQuery(
    {
      projectId: projectId,
    },
    {
      enabled: hasReadAccess,
    },
  );

  const memberships = data.data?.memberships ?? []; // Active Members
  const invitations = data.data?.invitations ?? []; // Pending Members

  const mutDeleteMembership = api.projectMembers.delete.useMutation({
    onSuccess: () => utils.projectMembers.invalidate(),
  });
  const mutDeleteInvitation = api.projectMembers.deleteInvitation.useMutation({
    onSuccess: () => utils.projectMembers.invalidate(),
  });

  if (!hasReadAccess) return null;

  return (
    <div>
      <Header title="Project Members" level="h3" />
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
            {memberships.map((m) => (
              <TableRow key={m.userId} className="hover:bg-transparent">
                <TableCell>{m.user.name}</TableCell>
                <TableCell>{m.user.email}</TableCell>
                <TableCell>{m.role}</TableCell>
                {hasDeleteAccess &&
                m.user.id !== session.data?.user?.id &&
                m.role !== "OWNER" ? (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
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
      {invitations.length > 0 ? (
        <>
          <h3 className="mb-3 text-sm font-semibold leading-4 text-gray-600">
            Pending Invites
          </h3>
          <Card className="mb-4">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-gray-900">Email</TableHead>
                  <TableHead className="text-gray-900">Role</TableHead>
                  <TableHead className="text-gray-900">Sent by</TableHead>
                  {hasDeleteAccess ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody className="text-gray-500">
                {invitations.map((invite) => (
                  <TableRow key={invite.id} className="hover:bg-transparent">
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{invite.role}</TableCell>
                    <TableCell>
                      {invite.sender ? invite.sender.name : ""}
                    </TableCell>
                    {hasDeleteAccess ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          loading={mutDeleteInvitation.isLoading}
                          onClick={() => {
                            mutDeleteInvitation.mutate({
                              id: invite.id,
                              projectId: projectId,
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
        </>
      ) : null}
      <CreateProjectMemberButton projectId={projectId} />
    </div>
  );
}
