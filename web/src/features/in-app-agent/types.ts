export type InAppAgentToolCallContent = {
  type: "tool";
  name: string;
  args: string;
  status: "running" | "succeeded" | "failed" | "denied";
  result?: string;
  error?: string;
  approval?: {
    id: string;
    status: "pending" | "submitting";
  };
};

export type InAppAgentError =
  | { type: "generic"; message: string }
  | { type: "rate_limit"; retryAt: number };
