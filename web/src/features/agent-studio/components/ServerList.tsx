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

export function ServerList({ projectId, selectedServerId, onSelectServer }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<AgentStudioServerRecord | null>(null);

  const utils = api.useUtils();
  const { data: servers, isLoading } = api.agentStudio.listServers.useQuery({ projectId });
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

  const handleDelete = (server: AgentStudioServerRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete server "${server.name}"?`)) {
      deleteMutation.mutate({ projectId, serverId: server.id });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Servers
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
        )}
        {!isLoading && (!servers || servers.length === 0) && (
          <div className="px-3 py-4 text-center">
            <Server className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No servers yet</p>
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
              "group flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
              selectedServerId === server.id && "bg-accent",
            )}
          >
            <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{server.name}</div>
              <div className="truncate text-xs text-muted-foreground">{server.serverUrl}</div>
              {server.chains.length > 0 && (
                <Badge variant="secondary" className="mt-0.5 text-xs">
                  {server.chains.length} chain{server.chains.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                className="rounded p-0.5 hover:bg-background"
                onClick={(e) => handleEdit(server as AgentStudioServerRecord, e)}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                className="rounded p-0.5 hover:bg-background"
                onClick={(e) => handleDelete(server as AgentStudioServerRecord, e)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
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
