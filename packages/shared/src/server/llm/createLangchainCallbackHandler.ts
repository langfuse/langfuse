import { CallbackHandler } from "langfuse-langchain";
import { TraceParams } from "./types";

export function createLangchainCallbackHandler(
  traceParams: Omit<TraceParams, "tokenCountDelegate">,
): CallbackHandler {
  return new CallbackHandler({
    _projectId: traceParams.projectId,
    _isLocalEventExportEnabled: true,
    tags: traceParams.tags,
  });
}
