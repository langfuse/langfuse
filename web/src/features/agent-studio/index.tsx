import React, { useCallback, useEffect, useState } from "react";
import { Play, ChevronDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { Separator } from "@/src/components/ui/separator";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import Page from "@/src/components/layouts/page";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type LangGraphAssistant, type ChainStep, type AgentStudioServerRecord } from "./types";
import { EmptyServerState } from "./components/EmptyServerState";
import { ServerList } from "./components/ServerList";
import { GraphSelector } from "./components/GraphSelector";
import { InputForm } from "./components/InputForm";
import { RunPanel } from "./components/RunPanel";
import { ThreadList } from "./components/ThreadList";
import { ServerConfigSheet } from "./components/ServerConfigSheet";
import { ChainBuilder } from "./components/ChainBuilder";
import { useLangGraphApi } from "./hooks/useLangGraphApi";
import { useAgentStream } from "./hooks/useAgentStream";

export default function AgentStudioPage() {
  const projectId = useProjectIdFromURL() ?? "";

  const [selectedServer, setSelectedServer] = useState<AgentStudioServerRecord | null>(null);
  const [selectedAssistant, setSelectedAssistant] = useState<LangGraphAssistant | null>(null);
  const [assistants, setAssistants] = useState<LangGraphAssistant[]>([]);
  const [assistantsLoading, setAssistantsLoading] = useState(false);
  const [schema, setSchema] = useState<Record<string, unknown> | undefined>(undefined);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [chainBuilderOpen, setChainBuilderOpen] = useState(false);
  const [chainRunning, setChainRunning] = useState(false);

  const { listAssistants, getSchema, createThread, streamRun } = useLangGraphApi(
    projectId,
    selectedServer?.id ?? null,
  );
  const { state: streamState, run, cancel, reset } = useAgentStream();

  const { data: servers } = api.agentStudio.listServers.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Auto-select first server if none selected
  useEffect(() => {
    if (!selectedServer && servers && servers.length > 0) {
      setSelectedServer(servers[0] as AgentStudioServerRecord);
    }
  }, [servers, selectedServer]);

  // Load assistants when server changes
  useEffect(() => {
    if (!selectedServer) return;
    setAssistants([]);
    setSelectedAssistant(null);
    setSchema(undefined);
    setAssistantsLoading(true);
    listAssistants()
      .then((data) => setAssistants(data))
      .catch(() => setAssistants([]))
      .finally(() => setAssistantsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServer?.id]);

  // Load schema when assistant changes
  useEffect(() => {
    if (!selectedAssistant) return;
    setSchemaLoading(true);
    setSchema(undefined);
    setInputValues({});
    getSchema(selectedAssistant.assistant_id)
      .then((s) => setSchema(s))
      .catch(() => setSchema(undefined))
      .finally(() => setSchemaLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssistant?.assistant_id]);

  const handleRun = useCallback(async () => {
    if (!selectedAssistant) return;
    reset();
    try {
      const thread = await createThread();
      const stream = streamRun(
        thread.thread_id,
        selectedAssistant.assistant_id,
        inputValues,
      );
      if (stream) await run(stream);
    } catch (err) {
      console.error("Run failed", err);
    }
  }, [selectedAssistant, inputValues, createThread, streamRun, run, reset]);

  const handleRunChain = useCallback(
    async (steps: ChainStep[]) => {
      if (steps.length === 0) return;
      setChainBuilderOpen(false);
      setChainRunning(true);
      reset();

      let currentInput: Record<string, unknown> = inputValues;

      for (const step of steps) {
        try {
          const thread = await createThread();
          const stream = streamRun(thread.thread_id, step.assistantId, currentInput);
          if (!stream) break;
          const events = await run(stream);

          // Apply field mappings for the next step
          const outputState: Record<string, unknown> = {};
          for (const event of events) {
            if (event.type === "values" && event.data && typeof event.data === "object") {
              Object.assign(outputState, event.data);
            }
          }

          const nextInput: Record<string, unknown> = {};
          for (const mapping of step.fieldMappings) {
            const parts = mapping.fromPath.split(".");
            let val: unknown = outputState;
            for (const part of parts) {
              val = (val as Record<string, unknown>)?.[part];
            }
            if (val !== undefined) nextInput[mapping.toField] = val;
          }
          currentInput = nextInput;
        } catch {
          break;
        }
      }
      setChainRunning(false);
    },
    [inputValues, createThread, streamRun, run, reset],
  );

  const noServers = !servers || servers.length === 0;

  return (
    <Page
      headerProps={{
        title: "Agent Studio",
        help: {
          description:
            "Connect any LangGraph server to run graphs and debug agents interactively.",
          href: "https://langfuse.com/docs",
        },
      }}
    >
      {noServers ? (
        <EmptyServerState onAddServer={() => setAddServerOpen(true)} />
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          {/* Left: server + graph list */}
          <ResizablePanel defaultSize={22} minSize={16} maxSize={32}>
            <div className="flex h-full flex-col">
              <ServerList
                projectId={projectId}
                selectedServerId={selectedServer?.id ?? null}
                onSelectServer={setSelectedServer}
              />
              {selectedServer && (
                <>
                  <Separator />
                  <div className="flex items-center px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Graphs
                    </span>
                  </div>
                  <ScrollArea className="flex-1">
                    <GraphSelector
                      assistants={assistants}
                      isLoading={assistantsLoading}
                      selectedId={selectedAssistant?.assistant_id ?? null}
                      onSelect={setSelectedAssistant}
                    />
                  </ScrollArea>
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center: input + run */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="flex h-full flex-col">
              {!selectedAssistant ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Select a graph to get started
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b px-4 py-2">
                    <span className="font-medium">
                      {selectedAssistant.name || selectedAssistant.graph_id}
                    </span>
                    <Button
                      size="sm"
                      onClick={handleRun}
                      disabled={streamState.status === "running" || chainRunning}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Run
                    </Button>
                  </div>

                  <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel defaultSize={40} minSize={20}>
                      <ScrollArea className="h-full">
                        <div className="flex flex-col gap-4 p-4">
                          <InputForm
                            schema={schema}
                            isLoading={schemaLoading}
                            values={inputValues}
                            onChange={setInputValues}
                          />

                          {/* Chain Mode */}
                          <Collapsible
                            open={chainBuilderOpen}
                            onOpenChange={setChainBuilderOpen}
                          >
                            <CollapsibleTrigger className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${chainBuilderOpen ? "" : "-rotate-90"}`}
                              />
                              Chain Mode (Advanced)
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-3">
                              <ChainBuilder
                                projectId={projectId}
                                serverId={selectedServer!.id}
                                assistants={assistants}
                                onClose={() => setChainBuilderOpen(false)}
                                onRunChain={handleRunChain}
                              />
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      </ScrollArea>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={60} minSize={30}>
                      <div className="h-full p-4">
                        <RunPanel
                          state={streamState}
                          onCancel={cancel}
                          onReset={reset}
                        />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: thread history */}
          <ResizablePanel defaultSize={28} minSize={18} maxSize={36}>
            <ThreadList projectId={projectId} serverId={selectedServer?.id ?? null} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <ServerConfigSheet
        open={addServerOpen}
        onClose={() => setAddServerOpen(false)}
        projectId={projectId}
      />
    </Page>
  );
}
