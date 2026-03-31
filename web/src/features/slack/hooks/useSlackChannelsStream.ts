import { useCallback, useEffect, useRef, useState } from "react";
import { env } from "@/src/env.mjs";
import { parseSSEBuffer } from "@/src/hooks/useSSEDashboardQuery";
import type { SlackChannelsFetchProgress } from "@langfuse/shared/src/server";

export type SlackChannelsStreamResult = {
  channelsData:
    | {
        channels: {
          id: string;
          name: string;
          isPrivate: boolean;
          isMember: boolean;
        }[];
        teamId: string;
        teamName: string;
      }
    | undefined;
  progress: SlackChannelsFetchProgress | null;
  /** Seconds Slack asked us to wait (from SSE `rate_limit`); cleared on next progress. */
  rateLimitSecondsRemaining: number | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

type SSEEvent = { type: string; data: string };

/**
 * Streams Slack channel list with per-page progress (SSE).
 * Disabled until `enabled` is true (e.g. user chooses "Fetch channels").
 */
export function useSlackChannelsStream(
  projectId: string | undefined,
  options: { enabled?: boolean } = {},
): SlackChannelsStreamResult {
  const { enabled = false } = options;
  const [channelsData, setChannelsData] =
    useState<SlackChannelsStreamResult["channelsData"]>(undefined);
  const [progress, setProgress] = useState<SlackChannelsFetchProgress | null>(
    null,
  );
  const [rateLimitSecondsRemaining, setRateLimitSecondsRemaining] = useState<
    number | null
  >(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
  const abortRef = useRef<AbortController | null>(null);

  const runFetch = useCallback(async () => {
    if (!projectId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setProgress(null);
    setRateLimitSecondsRemaining(null);
    setError(null);
    setChannelsData(undefined);

    try {
      const resp = await fetch(`${basePath}/api/slack/channels-fetch-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const body = await resp.text();
        let message = `HTTP ${resp.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed.message) message = parsed.message;
        } catch {
          if (body) message = body;
        }
        throw new Error(message);
      }

      if (!resp.body) {
        throw new Error("No response body");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamTerminal = false;

      const handleEvent = (event: SSEEvent) => {
        if (controller.signal.aborted) return;
        if (event.type === "progress") {
          try {
            const p = JSON.parse(event.data) as SlackChannelsFetchProgress;
            setProgress(p);
            setRateLimitSecondsRemaining(null);
          } catch {
            /* ignore malformed chunk */
          }
        } else if (event.type === "rate_limit") {
          try {
            const { retryAfterSeconds } = JSON.parse(event.data) as {
              retryAfterSeconds: number;
            };
            const secs = Math.max(1, Math.floor(Number(retryAfterSeconds)));
            if (!Number.isNaN(secs)) {
              setRateLimitSecondsRemaining(secs);
            }
          } catch {
            /* ignore */
          }
        } else if (event.type === "complete") {
          try {
            const data = JSON.parse(event.data) as NonNullable<
              SlackChannelsStreamResult["channelsData"]
            >;
            setChannelsData(data);
            setStatus("success");
            setProgress(null);
            setRateLimitSecondsRemaining(null);
            streamTerminal = true;
          } catch {
            setError("Invalid response from server");
            setStatus("error");
            streamTerminal = true;
          }
        } else if (event.type === "error") {
          try {
            const { message } = JSON.parse(event.data) as { message: string };
            setError(message ?? "Failed to load channels");
          } catch {
            setError("Failed to load channels");
          }
          setStatus("error");
          setRateLimitSecondsRemaining(null);
          streamTerminal = true;
        }
      };

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSSEBuffer(buffer);
        buffer = parsed.remaining;
        for (const ev of parsed.events) {
          handleEvent(ev);
        }
      }

      if (!controller.signal.aborted && !streamTerminal) {
        setError("Connection closed before the channel list finished loading.");
        setStatus("error");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load channels");
      setStatus("error");
    }
  }, [basePath, projectId]);

  useEffect(() => {
    if (!enabled || !projectId) {
      setStatus("idle");
      abortRef.current?.abort();
      return;
    }
    void runFetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, projectId, runFetch]);

  return {
    channelsData,
    progress,
    rateLimitSecondsRemaining,
    status,
    error,
    isLoading: status === "loading",
    refetch: runFetch,
  };
}
