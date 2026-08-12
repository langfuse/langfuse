// CIP fork feature (see FORK.md): the Elicitations index table.
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { Inbox, Lock, MoreVertical, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { type ElicitationStatus } from "../lib/contract";
import { ElicitationStatusBadge } from "./ElicitationStatusBadge";

type RowData = {
  key: { id: string; name: string };
  status: ElicitationStatus;
  submissionCount: number;
  createdAt: string;
  createdBy: string;
};

export function ElicitationsTable({ projectId }: { projectId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const elicitations = api.elicitations.all.useQuery({
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const hasCudAccess = useHasProjectAccess({
    projectId,
    scope: "elicitations:CUD",
  });

  const invalidate = () => utils.elicitations.invalidate();
  const close = api.elicitations.close.useMutation({ onSuccess: invalidate });
  const reopen = api.elicitations.reopen.useMutation({ onSuccess: invalidate });
  const deleteMutation = api.elicitations.delete.useMutation({
    onSuccess: invalidate,
  });

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "key",
      header: "Name",
      id: "key",
      size: 250,
      isPinnedLeft: true,
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <TableLink
            path={`/project/${projectId}/elicitations/${key.id}`}
            value={key.name}
          />
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      id: "status",
      size: 100,
      cell: ({ row }) => {
        const status: RowData["status"] = row.getValue("status");
        return <ElicitationStatusBadge status={status} />;
      },
    },
    {
      accessorKey: "submissionCount",
      header: "Submissions",
      id: "submissionCount",
      size: 100,
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        const count: RowData["submissionCount"] =
          row.getValue("submissionCount");
        return (
          <TableLink
            path={`/project/${projectId}/elicitations/${key.id}/submissions`}
            value={String(count)}
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Date Created",
      id: "createdAt",
      size: 150,
    },
    {
      accessorKey: "createdBy",
      header: "Created By",
      id: "createdBy",
      size: 150,
    },
    {
      accessorKey: "actions",
      header: "Actions",
      id: "actions",
      size: 70,
      isFixedPosition: true,
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        const status: RowData["status"] = row.getValue("status");
        if (!hasCudAccess) {
          return <Lock className="h-3 w-3 text-muted-foreground" />;
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/project/${projectId}/elicitations/${key.id}/submissions`,
                  )
                }
              >
                <Inbox className="mr-2 h-4 w-4" />
                View submissions
              </DropdownMenuItem>
              {status === "open" && (
                <DropdownMenuItem
                  onClick={() =>
                    close.mutate({ projectId, elicitationId: key.id })
                  }
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Close form
                </DropdownMenuItem>
              )}
              {status === "closed" && (
                <DropdownMenuItem
                  onClick={() =>
                    reopen.mutate({ projectId, elicitationId: key.id })
                  }
                >
                  <Play className="mr-2 h-4 w-4" />
                  Reopen form
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setPendingDeleteId(key.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["elicitations"]["all"]["elicitations"][number],
  ): RowData => ({
    key: { id: item.id, name: item.name },
    status: item.status,
    submissionCount: item.submissionCount,
    createdAt: new Date(item.createdAt).toLocaleString(),
    createdBy: item.createdBy ?? "–",
  });

  return (
    <>
      <DataTable
        tableName={"cipElicitations"}
        columns={columns}
        data={
          elicitations.isLoading
            ? { isLoading: true, isError: false }
            : elicitations.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: elicitations.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: (elicitations.data?.elicitations ?? []).map(
                    convertToTableRow,
                  ),
                }
        }
        pagination={{
          totalCount: elicitations.data?.totalCount ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this elicitation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the elicitation and all of its
              submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) {
                  deleteMutation.mutate({
                    projectId,
                    elicitationId: pendingDeleteId,
                  });
                }
                setPendingDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
