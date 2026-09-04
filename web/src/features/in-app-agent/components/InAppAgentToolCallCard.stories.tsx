import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { InAppAgentToolCallCard } from "./InAppAgentToolCallCard";

const toolErrorCountSource = `type ToolCall = {
  id: string;
  name: string;
  arguments: unknown;
  type: string;
  index: number;
};

type EvaluationContext = {
  observation: {
    input: any;
    output: any;
    metadata: any;
    toolCalls: ToolCall[];
  };
  experiment:
    | {
        itemExpectedOutput: any;
        itemMetadata: any;
      }
    | undefined;
};

type ScoreBase = {
  name: string;
  comment?: string;
  configId?: string | null;
  metadata?: Record<string, unknown>;
};

type NumericScore = ScoreBase & {
  dataType: "NUMERIC";
  value: number;
};

type Score = NumericScore;

type EvaluationResult = {
  scores: Score[];
};

function parseIfJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function hasErrorShape(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (lower === "error" || lower === "error_message" || lower === "errormessage") {
        const v = obj[key];
        if (v != null && v !== false && v !== "") return true;
      }
      if (lower === "status" || lower === "state") {
        const v = String(obj[key]).toLowerCase();
        if (v === "error" || v === "failed" || v === "failure") return true;
      }
      if (lower === "ok" || lower === "success") {
        if (obj[key] === false) return true;
      }
    }
  }
  return false;
}

function evaluate({
  observation,
}: EvaluationContext): EvaluationResult {
  const output = observation.output;
  const metadata = observation.metadata;

  let errorCount = 0;
  const reasons: string[] = [];

  // Signal 1: observation-level error status set by instrumentation
  const level = (metadata && typeof metadata === "object" ? (metadata as any).level : undefined) as
    | string
    | undefined;
  if (level && String(level).toUpperCase() === "ERROR") {
    errorCount += 1;
    reasons.push("metadata.level=ERROR");
  }

  // Signal 2: error-shaped fields in the parsed tool output
  const parsedOutput = parseIfJson(output);
  if (hasErrorShape(parsedOutput)) {
    errorCount += 1;
    reasons.push("error field present in tool output");
  }

  return {
    scores: [
      {
        name: "tool_error_count",
        value: errorCount,
        dataType: "NUMERIC",
        comment:
          errorCount > 0
            ? \`Detected \${errorCount} tool error indicator(s): \${reasons.join(", ")}.\`
            : "No tool error indicators detected.",
        metadata: {
          reasons,
        },
      },
    ],
  };
}`;

const toolErrorCountDefinition = {
  name: "tool_error_count",
  type: "CODE",
  description:
    "Counts tool-call errors on a TOOL observation by checking the observation's level/status and scanning parsed output for common error fields.",
  versions: [
    {
      version: 1,
      sourceCode: toolErrorCountSource,
      sourceCodeLanguage: "TYPESCRIPT",
    },
  ],
};

const toolErrorCountArguments = JSON.stringify(toolErrorCountDefinition);

const toolErrorCountResult = JSON.stringify({
  content: [
    {
      type: "text",
      text: JSON.stringify({
        evaluator: {
          name: "tool_error_count",
          type: "CODE",
          version: 1,
          status: "created",
        },
      }),
    },
  ],
});

const approvalToolErrorCountArguments = JSON.stringify({
  ...toolErrorCountDefinition,
  versions: [
    {
      ...toolErrorCountDefinition.versions[0],
      sourceCode: `${toolErrorCountSource}\n\nconst healthMarker = "\\u2713";`,
    },
    {
      ...toolErrorCountDefinition.versions[0],
      version: 2,
      sourceCode: `${toolErrorCountSource}\n\nconst healthMarker = "\\u2713";`,
    },
  ],
});

const meta = preview.meta({
  component: InAppAgentToolCallCard,
});

const showToolCall = async ({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText("Show"));
  return canvas;
};

export const Default = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_queryMetrics",
      status: "succeeded",
      args: JSON.stringify(
        {
          view: "observations",
          metrics: [{ measure: "count", aggregation: "count" }],
        },
        null,
        2,
      ),
      result: JSON.stringify({ data: [{ count_count: 42 }] }, null, 2),
    },
  },
});

export const Error = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_getTraces",
      status: "failed",
      args: JSON.stringify({ limit: 10 }, null, 2),
      error: "Failed to load traces: missing project access.",
    },
  },
});

export const EvaluatorToolCall = meta.story({
  name: "Evaluator tool call",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_createEvaluator",
      status: "succeeded",
      args: toolErrorCountArguments,
      result: toolErrorCountResult,
    },
  },
});

export const LargePayload = meta.story({
  name: "(Test) Large payload",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_queryMetrics",
      status: "succeeded",
      args: JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [
            `field-${index + 1}`,
            `value-${index + 1}`,
          ]),
        ),
      ),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByRole("button", { name: "..." })).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /show arguments/i }),
    ).not.toBeInTheDocument();
  },
});

export const InvalidPayload = meta.story({
  name: "(Test) Invalid payload",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_queryMetrics",
      status: "failed",
      args: "{ not valid JSON",
      error: "The tool rejected the request.",
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("{ not valid JSON")).toBeVisible();
    await expect(
      canvas.getByText("The tool rejected the request."),
    ).toBeVisible();
  },
});

export const SandboxBash = meta.story({
  name: "(Test) Sandbox bash",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "bash",
      status: "succeeded",
      args: JSON.stringify({ command: "pnpm test -- changed.test.ts" }),
      result: JSON.stringify({
        stdout: "Tests  4 passed (4)\n",
        stderr: "",
        exitCode: 0,
        startedAt: "2026-08-19T08:00:00.000Z",
        completedAt: "2026-08-19T08:00:01.000Z",
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("$")).toBeVisible();
    await expect(
      canvas.queryByText("Exited with code 0"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Arguments")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const SandboxRead = meta.story({
  name: "(Test) Sandbox read",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "read",
      status: "succeeded",
      args: JSON.stringify({ path: "src/example.ts" }),
      result: JSON.stringify({
        path: "/workspace/src/example.ts",
        content: "export const answer = 42;\n",
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("Read")).toBeVisible();
    await expect(canvas.getByText("export const answer = 42;")).toBeVisible();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const SandboxWrite = meta.story({
  name: "(Test) Sandbox write",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "write",
      status: "succeeded",
      args: JSON.stringify({
        path: "src/example.ts",
        content: "export const answer = 42;\n",
      }),
      result: JSON.stringify({
        path: "/workspace/src/example.ts",
        bytesWritten: 26,
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("Write")).toBeVisible();
    await expect(canvas.queryByText(/Written/)).not.toBeInTheDocument();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const SandboxEdit = meta.story({
  name: "(Test) Sandbox edit",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "edit",
      status: "succeeded",
      args: JSON.stringify({
        path: "src/example.ts",
        oldText: "export const answer = 41;\n",
        newText: "export const answer = 42;\n",
      }),
      result: JSON.stringify({
        path: "/workspace/src/example.ts",
        replaced: true,
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("Edit")).toBeVisible();
    await expect(canvas.queryByText("Applied")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const ApprovalRequired = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      status: "running",
      args: JSON.stringify(
        {
          name: "regression-examples",
          description: "Examples used for release regression tests",
        },
        null,
        2,
      ),
      approval: {
        id: "approval-1",
        status: "pending",
      },
    },
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
});

export const ApprovalSubmitting = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      status: "running",
      args: JSON.stringify(
        {
          name: "regression-examples",
          description: "Examples used for release regression tests",
        },
        null,
        2,
      ),
      approval: {
        id: "approval-1",
        status: "submitting",
      },
    },
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
});

export const ApprovalDisabled = meta.story({
  name: "(Test) Approval disabled",
  args: {
    isCompact: true,
    isDisabled: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      status: "running",
      args: JSON.stringify(
        {
          name: "regression-examples",
          description: "Examples used for release regression tests",
        },
        null,
        2,
      ),
      approval: {
        id: "approval-1",
        status: "pending",
      },
    },
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("button", { name: "Approve" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", {
        name: "Always approve for this conversation",
      }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Decline" }),
    ).toBeDisabled();
  },
});

export const ApprovalRequiredWithCode = meta.story({
  name: "(Test) Approval required with code",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_createEvaluator",
      status: "running",
      args: approvalToolErrorCountArguments,
      approval: {
        id: "approval-code-1",
        status: "pending",
      },
    },
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("button", { name: "Approve" })).toBeVisible();
    const showCodeButtons = canvas.getAllByRole("button", {
      name: "Show in code block",
    });
    await expect(showCodeButtons).toHaveLength(2);
    await userEvent.click(showCodeButtons[1]);
    await expect(canvas.getByTitle("versions[1].sourceCode")).toBeVisible();
  },
});
