import React, { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/src/components/ui/sheet";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Badge } from "@/src/components/ui/badge";
import { api } from "@/src/utils/api";
import { type AgentStudioServerRecord } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  server?: AgentStudioServerRecord | null;
};

export function ServerConfigSheet({ open, onClose, projectId, server }: Props) {
  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const utils = api.useUtils();

  useEffect(() => {
    if (open) {
      setName(server?.name ?? "");
      setServerUrl(server?.serverUrl ?? "");
      setTestResult(null);
    }
  }, [open, server]);

  const upsert = api.agentStudio.upsertServer.useMutation({
    onSuccess: async () => {
      await utils.agentStudio.listServers.invalidate({ projectId });
      onClose();
    },
  });

  const testMutation = api.agentStudio.testConnection.useMutation({
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ success: false, error: err.message }),
  });

  const handleSave = () => {
    upsert.mutate({
      projectId,
      id: server?.id,
      name: name.trim(),
      serverUrl: serverUrl.trim(),
    });
  };

  const handleTest = () => {
    if (server?.id) {
      testMutation.mutate({ projectId, serverId: server.id });
    }
  };

  const isValid =
    name.trim().length > 0 &&
    serverUrl.trim().length > 0 &&
    (() => {
      try {
        new URL(serverUrl.trim());
        return true;
      } catch {
        return false;
      }
    })();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{server ? "Edit Server" : "Add LangGraph Server"}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-name">Name</Label>
            <Input
              id="server-name"
              placeholder="My Agent Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-url">Server URL</Label>
            <Input
              id="server-url"
              placeholder="http://localhost:2024"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>
          {server && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? "Testing…" : "Test Connection"}
              </Button>
              {testResult && (
                <Badge variant={testResult.success ? "outline" : "destructive"}>
                  {testResult.success ? "Connected" : (testResult.error ?? "Failed")}
                </Badge>
              )}
            </div>
          )}
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || upsert.isPending}
          >
            {upsert.isPending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
