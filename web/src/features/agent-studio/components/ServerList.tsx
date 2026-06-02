import React, { useState } from "react";
import { Plus, Pencil, Trash2, Server } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Separator } from "@/src/components/ui/separator";
import { api } from "@/src/utils/api";
import { type AgentStudioServerRecord } from "../types";
import { ServerConfigSheet } from "./ServerConfigSheet";
import { cn } from "@/src/utils/tailwind";

type Props = {
  projectId: string;
  selectedServerId: string | null;
  onSelectServer: (server: AgentStudioServerRecord) => void;
};

export function ServerList({
  projectId,
  selectedServerId,
  onSelectServer,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingServer, setEditingServer] =
    useState<AgentStudioServerRecord | null>(null);

  const utils = api.useUtils();
  const { data: servers, isLoading } = api.agentStudio.listServers.useQuery({
    projectId,
  });
  const deleteMutation = api.agentStudio.deleteServer.useMutation({
    onSuccess: async () => {
      await utils.agentStudio.listServers.invalidate({ projectId });
    },
  });

  const handleAdd = () => {
    setEditingServer(null);
    setSheetOpen(true);
  };

  const handleEdit = (server: AgentStudioServerRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingServer(server);
    setSheetOpen(true);
  };

  const handleDelete = (
    server: AgentStudioServerRecord,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (confirm(`Delete server "${server.name}"?`)) {
      deleteMutation.mutate({ projectId, serverId: server.id });
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Servers
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleAdd}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Separator />
      <div className="max-h-48 overflow-y-auto py-1">
        {isLoading && (
          <div className="text-muted-foreground px-3 py-2 text-xs">
            Loading…
          </div>
        )}
        {!isLoading && (!servers || servers.length === 0) && (
          <div className="px-3 py-4 text-center">
            <Server className="text-muted-foreground mx-auto mb-1 h-5 w-5" />
            <p className="text-muted-foreground text-xs">No servers yet</p>
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 text-xs"
              onClick={handleAdd}
            >
              Add one
            </Button>
          </div>
        )}
        {servers?.map((server) => (
          <button
            key={server.id}
            onClick={() => onSelectServer(server as AgentStudioServerRecord)}
            className={cn(
              "group hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
              selectedServerId === server.id && "bg-accent",
            )}
          >
            <Server className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{server.name}</div>
              <div className="text-muted-foreground truncate text-xs">
                {server.serverUrl}
              </div>
              {server.chains.length > 0 && (
                <Badge variant="secondary" className="mt-0.5 text-xs">
                  {server.chains.length} chain
                  {server.chains.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
              <div
                role="button"
                tabIndex={0}
                className="hover:bg-background cursor-pointer rounded p-0.5"
                onClick={(e) =>
                  handleEdit(server as AgentStudioServerRecord, e)
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  handleEdit(
                    server as AgentStudioServerRecord,
                    e as unknown as React.MouseEvent,
                  )
                }
              >
                <Pencil className="h-3 w-3" />
              </div>
              <div
                role="button"
                tabIndex={0}
                className="hover:bg-background cursor-pointer rounded p-0.5"
                onClick={(e) =>
                  handleDelete(server as AgentStudioServerRecord, e)
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  handleDelete(
                    server as AgentStudioServerRecord,
                    e as unknown as React.MouseEvent,
                  )
                }
              >
                <Trash2 className="text-destructive h-3 w-3" />
              </div>
            </div>
          </button>
        ))}
      </div>
      <ServerConfigSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        projectId={projectId}
        server={editingServer}
      />
    </div>
  );
}
