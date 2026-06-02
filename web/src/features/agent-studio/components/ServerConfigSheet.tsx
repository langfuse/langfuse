import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  ChevronDown,
  FileText,
} from "lucide-react";
import { Switch } from "@/src/components/ui/switch";
import { api } from "@/src/utils/api";
import { type AgentStudioServerRecord } from "../types";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success" }
  | { status: "error"; message: string };

type HeaderRow = { id: string; name: string; value: string; visible: boolean };

const LS_DOMAINS = (projectId: string) => `agent-studio:domains:${projectId}`;
const LS_RUN_CONFIG = (url: string) => `agent-studio:run-config:${url}`;

function loadSavedDomains(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(LS_DOMAINS(projectId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function nameFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  server?: AgentStudioServerRecord | null;
};

export function ServerConfigSheet({ open, onClose, projectId, server }: Props) {
  const [serverUrl, setServerUrl] = useState("");
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [streamSubgraphs, setStreamSubgraphs] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utils = api.useUtils();

  useEffect(() => {
    if (open) {
      const url = server?.serverUrl ?? "";
      setServerUrl(url);
      setTestState(server ? { status: "success" } : { status: "idle" });
      // When editing: show existing header names with empty values (user re-enters to change)
      setHeaders(
        (server?.headerNames ?? []).map((name, i) => ({
          id: String(Date.now() + i),
          name,
          value: "",
          visible: false,
        })),
      );
      setDomains(loadSavedDomains(projectId));
      setNewDomain("");
      setAdvancedOpen(false);
      if (url) {
        try {
          const rc = localStorage.getItem(LS_RUN_CONFIG(url));
          const parsed = rc
            ? (JSON.parse(rc) as { streamSubgraphs?: boolean })
            : {};
          setStreamSubgraphs(parsed.streamSubgraphs ?? true);
        } catch {
          setStreamSubgraphs(true);
        }
      }
    }
  }, [open, server, projectId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = serverUrl.trim();
    if (!trimmed) {
      setTestState({ status: "idle" });
      return;
    }
    let valid = false;
    try {
      new URL(trimmed);
      valid = true;
    } catch {
      /* */
    }
    if (!valid) {
      setTestState({ status: "idle" });
      return;
    }
    setTestState({ status: "idle" });
    debounceRef.current = setTimeout(() => void runTest(trimmed), 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [serverUrl]);

  const runTest = async (url: string) => {
    setTestState({ status: "testing" });
    try {
      // Test directly from the browser (same as LangSmith Studio) so that
      // localhost URLs resolve on the user's machine, not the Langfuse server.
      const res = await fetch(`${url.replace(/\/$/, "")}/assistants/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      setTestState(
        res.ok
          ? { status: "success" }
          : { status: "error", message: `HTTP ${res.status}` },
      );
    } catch (err) {
      setTestState({
        status: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      });
    }
  };

  const upsert = api.agentStudio.upsertServer.useMutation({
    onSuccess: async () => {
      await utils.agentStudio.listServers.invalidate({ projectId });
      onClose();
    },
  });

  const isUrlValid = (() => {
    try {
      new URL(serverUrl.trim());
      return true;
    } catch {
      return false;
    }
  })();
  const canConnect =
    isUrlValid && testState.status === "success" && !upsert.isPending;

  const handleConnect = () => {
    const url = serverUrl.trim();
    // Only send headers that have both a name AND a value filled in
    // (empty value = user left the pre-filled name row unchanged, meaning "keep existing")
    const filledHeaders = headers.filter(
      (h) => h.name.trim() && h.value.trim(),
    );
    // If editing and user didn't change any rows, pass undefined to keep existing encrypted headers
    const headersToSend =
      server && filledHeaders.length === 0 && headers.every((h) => !h.value)
        ? undefined
        : filledHeaders.map((h) => ({ name: h.name.trim(), value: h.value }));
    localStorage.setItem(LS_DOMAINS(projectId), JSON.stringify(domains));
    localStorage.setItem(
      LS_RUN_CONFIG(url),
      JSON.stringify({ streamSubgraphs }),
    );
    upsert.mutate({
      projectId,
      id: server?.id,
      name: nameFromUrl(url),
      serverUrl: url,
      headers: headersToSend,
    });
  };

  const addHeader = () =>
    setHeaders((h) => [
      ...h,
      { id: String(Date.now()), name: "", value: "", visible: false },
    ]);
  const removeHeader = (id: string) =>
    setHeaders((h) => h.filter((r) => r.id !== id));
  const updateHeader = (id: string, field: "name" | "value", val: string) =>
    setHeaders((h) => h.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  const toggleVisible = (id: string) =>
    setHeaders((h) =>
      h.map((r) => (r.id === id ? { ...r, visible: !r.visible } : r)),
    );

  const addDomain = () => {
    const d = newDomain.trim();
    if (d && !domains.includes(d)) {
      setDomains((p) => [...p, d]);
      setNewDomain("");
    }
  };
  const removeDomain = (d: string) =>
    setDomains((p) => p.filter((x) => x !== d));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Studio connection</DialogTitle>
          <DialogDescription>
            Enter the endpoint info of your Agent Server
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="gap-4">
          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="server-url">Base URL</Label>
            <Input
              id="server-url"
              placeholder="http://localhost:2024"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className={
                testState.status === "error"
                  ? "border-destructive focus-visible:ring-destructive"
                  : testState.status === "success"
                    ? "border-green-500 focus-visible:ring-green-500"
                    : ""
              }
            />
            <div className="flex h-4 items-center gap-1.5 text-xs">
              {testState.status === "idle" && isUrlValid && (
                <span className="text-muted-foreground">
                  Checking connection…
                </span>
              )}
              {testState.status === "testing" && (
                <>
                  <Loader2 className="text-muted-foreground h-3 w-3 animate-spin" />
                  <span className="text-muted-foreground">Testing…</span>
                </>
              )}
              {testState.status === "success" && (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span className="text-green-600">Connected</span>
                </>
              )}
              {testState.status === "error" && (
                <>
                  <XCircle className="text-destructive h-3 w-3" />
                  <span className="text-destructive">
                    {
                      (testState as { status: "error"; message: string })
                        .message
                    }
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Custom Headers */}
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-medium">Custom Headers</p>
              <p className="text-muted-foreground text-xs">
                {server?.headerNames?.length
                  ? "Header values are stored encrypted. Re-enter a value to update it, or leave blank to keep the existing value."
                  : "Stored encrypted on the server. Never sent to the browser after saving."}
              </p>
            </div>
            {headers.map((row) => (
              <div key={row.id} className="flex gap-2">
                <Input
                  placeholder="Header name"
                  value={row.name}
                  onChange={(e) => updateHeader(row.id, "name", e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
                <div className="relative flex-1">
                  <Input
                    placeholder="Header value"
                    type={row.visible ? "text" : "password"}
                    value={row.value}
                    onChange={(e) =>
                      updateHeader(row.id, "value", e.target.value)
                    }
                    className="pr-8 font-mono text-xs"
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                    onClick={() => toggleVisible(row.id)}
                  >
                    {row.visible ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 p-0"
                  onClick={() => removeHeader(row.id)}
                >
                  <Trash2 className="text-muted-foreground h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5 text-xs"
              onClick={addHeader}
            >
              <Plus className="h-3.5 w-3.5" />
              Custom Header
            </Button>
          </div>

          {/* Advanced Settings */}
          <div className="rounded-md border">
            <button
              type="button"
              className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-sm font-medium"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <ChevronDown
                className={`text-muted-foreground h-3.5 w-3.5 transition-transform ${advancedOpen ? "" : "-rotate-90"}`}
              />
              Advanced Settings
            </button>
            {advancedOpen && (
              <div className="flex flex-col gap-4 border-t px-3 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      Stream subgraph events
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Shows inner nodes of parallel subgraph runs in the
                      timeline.
                    </p>
                  </div>
                  <Switch
                    id="stream-subgraphs"
                    checked={streamSubgraphs}
                    onCheckedChange={setStreamSubgraphs}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-sm font-medium">Allowed Domains</p>
                    <p className="text-muted-foreground text-xs">
                      Only connect to servers on these domains. Use{" "}
                      <code className="bg-muted rounded px-1">*</code> as a
                      wildcard (e.g., *.example.com).
                    </p>
                  </div>
                  {domains.map((d) => (
                    <div key={d} className="flex items-center gap-2">
                      <Input
                        value={d}
                        readOnly
                        className="h-8 flex-1 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0 p-0"
                        onClick={() => removeDomain(d)}
                      >
                        <Trash2 className="text-muted-foreground h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. localhost or *.example.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addDomain()}
                      className="h-8 flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={addDomain}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="flex-row items-center justify-between px-4 py-3 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5"
            asChild
          >
            <a
              href="https://langchain-ai.github.io/langgraph/cloud/reference/api/api_ref/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="h-3.5 w-3.5" />
              Docs
            </a>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={!canConnect}>
              {upsert.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Connecting…
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
