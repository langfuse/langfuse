import { useCallback } from "react";
import { type LangGraphAssistant, type LangGraphThread } from "../types";

function buildProxyUrl(
  projectId: string,
  serverId: string,
  path: string,
): string {
  return `/api/project/${projectId}/langgraph/${path}?serverId=${serverId}`;
}

export function useLangGraphApi(projectId: string, serverId: string | null) {
  const proxyFetch = useCallback(
    async (path: string, options?: RequestInit): Promise<Response> => {
      if (!serverId) throw new Error("No server selected");
      return fetch(buildProxyUrl(projectId, serverId, path), options);
    },
    [projectId, serverId],
  );

  const listAssistants = useCallback(async (): Promise<LangGraphAssistant[]> => {
    const res = await proxyFetch("assistants/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 100 }),
    });
    if (!res.ok) throw new Error(`Failed to list assistants: ${res.status}`);
    const data = (await res.json()) as LangGraphAssistant[];
    return data;
  }, [proxyFetch]);

  const getSchema = useCallback(
    async (assistantId: string): Promise<Record<string, unknown>> => {
      const res = await proxyFetch(`assistants/${assistantId}/schemas`);
      if (!res.ok) throw new Error(`Failed to get schema: ${res.status}`);
      return res.json() as Promise<Record<string, unknown>>;
    },
    [proxyFetch],
  );

  const createThread = useCallback(async (): Promise<LangGraphThread> => {
    const res = await proxyFetch("threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
    return res.json() as Promise<LangGraphThread>;
  }, [proxyFetch]);

  const streamRun = useCallback(
    (
      threadId: string,
      assistantId: string,
      input: Record<string, unknown>,
    ): ReadableStream<Uint8Array> | null => {
      if (!serverId) return null;
      const url = buildProxyUrl(
        projectId,
        serverId,
        `threads/${threadId}/runs/stream`,
      );
      const controller = new AbortController();
      const stream = new ReadableStream<Uint8Array>({
        async start(streamCtrl) {
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assistant_id: assistantId,
                input,
                stream_mode: ["updates", "values"],
              }),
              signal: controller.signal,
            });
            if (!res.ok || !res.body) {
              streamCtrl.error(new Error(`Stream failed: ${res.status}`));
              return;
            }
            const reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              streamCtrl.enqueue(value);
            }
            streamCtrl.close();
          } catch (err) {
            if ((err as Error).name !== "AbortError") {
              streamCtrl.error(err);
            } else {
              streamCtrl.close();
            }
          }
        },
        cancel() {
          controller.abort();
        },
      });
      return stream;
    },
    [projectId, serverId],
  );

  return { listAssistants, getSchema, createThread, streamRun, proxyFetch };
}
