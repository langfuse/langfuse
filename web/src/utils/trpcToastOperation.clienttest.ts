// @vitest-environment node

import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import {
  createToastOperationMutationCache,
  getTrpcToastOperation,
  rememberTrpcToastOperation,
  resolveToastOperation,
} from "@/src/utils/trpcToastOperation";

describe("tRPC toast operation context", () => {
  it("associates a trusted tRPC procedure path with the emitted error", () => {
    const error = new Error("request failed");

    rememberTrpcToastOperation(error, "projects.create");

    expect(getTrpcToastOperation(error)).toBe("projects.create");
  });

  it("keeps operation context isolated per error object", () => {
    const createError = new Error("create failed");
    const deleteError = new Error("delete failed");

    rememberTrpcToastOperation(createError, "projects.create");
    rememberTrpcToastOperation(deleteError, "projects.delete");

    expect(getTrpcToastOperation(createError)).toBe("projects.create");
    expect(getTrpcToastOperation(deleteError)).toBe("projects.delete");
  });

  it("does not mutate the error object or attach analytics fields", () => {
    const error = Object.freeze(new Error("request failed"));

    expect(() =>
      rememberTrpcToastOperation(error, "projects.create"),
    ).not.toThrow();
    expect(Object.keys(error)).toEqual([]);
    expect(getTrpcToastOperation(error)).toBe("projects.create");
  });

  it("ignores primitive throw values", () => {
    rememberTrpcToastOperation("request failed", "projects.create");

    expect(getTrpcToastOperation("request failed")).toBeUndefined();
  });

  it("prefers the exact linked procedure path over semantic query metadata", () => {
    const error = new Error("request failed");
    rememberTrpcToastOperation(error, "topics.currentResults");

    expect(
      resolveToastOperation(
        error,
        { toastOperation: "topics.load" },
        "query.execute",
      ),
    ).toBe("topics.currentResults");
  });

  it("uses registered static metadata for non-tRPC query errors", () => {
    expect(
      resolveToastOperation(
        new Error("parse failed"),
        { toastOperation: "trace.parse" },
        "query.execute",
      ),
    ).toBe("trace.parse");
  });

  it("uses an explicit instrumentation-gap fallback for unattributed errors", () => {
    expect(
      resolveToastOperation(
        new Error("unknown source"),
        undefined,
        "query.execute",
      ),
    ).toBe("query.execute");
  });

  it("rejects unregistered metadata instead of forwarding dynamic values", () => {
    expect(
      resolveToastOperation(
        new Error("request failed"),
        { toastOperation: "project_123" } as never,
        "query.execute",
      ),
    ).toBe("query.execute");
  });

  it("makes static mutation metadata available to the default error handler", async () => {
    const error = new Error("post-success callback failed");
    const report = vi.fn();
    const queryClient = new QueryClient({
      mutationCache: createToastOperationMutationCache(),
      defaultOptions: {
        mutations: {
          onError: (receivedError) => {
            report(
              resolveToastOperation(
                receivedError,
                undefined,
                "mutation.execute",
              ),
            );
          },
        },
      },
    });
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => Promise.reject(error),
      meta: { toastOperation: "sharing.update" },
    });

    await expect(observer.mutate()).rejects.toBe(error);

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith("sharing.update");
  });

  it("keeps a linked tRPC path ahead of remembered mutation metadata", async () => {
    const error = new Error("request failed");
    rememberTrpcToastOperation(error, "projects.create");
    const observedOperations: string[] = [];
    const queryClient = new QueryClient({
      mutationCache: createToastOperationMutationCache(),
      defaultOptions: {
        mutations: {
          onError: (receivedError) => {
            observedOperations.push(
              resolveToastOperation(
                receivedError,
                undefined,
                "mutation.execute",
              ),
            );
          },
        },
      },
    });
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => Promise.reject(error),
      meta: { toastOperation: "sharing.update" },
    });

    await expect(observer.mutate()).rejects.toBe(error);

    expect(observedOperations).toEqual(["projects.create"]);
  });
});
