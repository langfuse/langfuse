"use client";

import {
  InAppAgentSandboxBashArgsSchema,
  InAppAgentSandboxBashResultSchema,
  InAppAgentSandboxEditArgsSchema,
  InAppAgentSandboxEditResultSchema,
  InAppAgentSandboxReadArgsSchema,
  InAppAgentSandboxReadResultSchema,
  InAppAgentSandboxToolArgsSchemas,
  InAppAgentSandboxToolNameSchema,
  InAppAgentSandboxToolResultSchemas,
  InAppAgentSandboxWriteArgsSchema,
} from "@langfuse/shared/in-app-agent";
import { type z } from "zod";
import { assertUnreachable } from "@/src/utils/types";
import { InAppAgentToolPayload } from "./InAppAgentToolPayload";
import { InAppAgentToolResultPayload } from "./InAppAgentToolResultPayload";
import type { InAppAgentToolCallContent } from "./utils/utils";

export function InAppAgentToolCallDetails({
  tool,
}: {
  tool: InAppAgentToolCallContent;
}) {
  const toolName = InAppAgentSandboxToolNameSchema.safeParse(tool.name);
  if (!toolName.success) {
    return <DefaultToolCallDetails tool={tool} />;
  }

  const args = parseSandboxPayload(
    tool.args,
    InAppAgentSandboxToolArgsSchemas[toolName.data],
  );
  const result = parseSandboxResult(
    tool.result,
    InAppAgentSandboxToolResultSchemas[toolName.data],
  );
  if (!args || !result.isValid) {
    return <DefaultToolCallDetails tool={tool} />;
  }

  if (toolName.data === "read") {
    return (
      <SandboxToolCallDetails tool={tool}>
        <ReadToolCallDetails
          args={InAppAgentSandboxReadArgsSchema.parse(args)}
          result={
            result.data
              ? InAppAgentSandboxReadResultSchema.parse(result.data)
              : undefined
          }
        />
      </SandboxToolCallDetails>
    );
  }

  if (toolName.data === "write") {
    return (
      <SandboxToolCallDetails tool={tool}>
        <WriteToolCallDetails
          args={InAppAgentSandboxWriteArgsSchema.parse(args)}
        />
      </SandboxToolCallDetails>
    );
  }

  if (toolName.data === "edit") {
    return (
      <SandboxToolCallDetails tool={tool}>
        <EditToolCallDetails
          args={InAppAgentSandboxEditArgsSchema.parse(args)}
          result={
            result.data
              ? InAppAgentSandboxEditResultSchema.parse(result.data)
              : undefined
          }
        />
      </SandboxToolCallDetails>
    );
  }

  if (toolName.data === "bash") {
    return (
      <SandboxToolCallDetails tool={tool}>
        <BashToolCallDetails
          args={InAppAgentSandboxBashArgsSchema.parse(args)}
          result={
            result.data
              ? InAppAgentSandboxBashResultSchema.parse(result.data)
              : undefined
          }
        />
      </SandboxToolCallDetails>
    );
  }

  return assertUnreachable(toolName.data);
}

function SandboxToolCallDetails({
  tool,
  children,
}: {
  tool: InAppAgentToolCallContent;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      {tool.error !== undefined && (
        <InAppAgentToolResultPayload status={tool.status} value={tool.error} />
      )}
    </div>
  );
}

function ReadToolCallDetails({
  args,
  result,
}: {
  args: z.infer<typeof InAppAgentSandboxReadArgsSchema>;
  result: z.infer<typeof InAppAgentSandboxReadResultSchema> | undefined;
}) {
  return (
    <SandboxFileFrame operation="Read" path={args.path}>
      {result ? (
        <pre className="max-h-64 overflow-auto p-2.5 font-mono text-xs leading-5 wrap-break-word whitespace-pre-wrap">
          {result.content === null ? (
            <span className="text-destructive">File not found</span>
          ) : result.content === "" ? (
            <span className="text-muted-foreground italic">Empty file</span>
          ) : (
            result.content
          )}
        </pre>
      ) : null}
    </SandboxFileFrame>
  );
}

function WriteToolCallDetails({
  args,
}: {
  args: z.infer<typeof InAppAgentSandboxWriteArgsSchema>;
}) {
  return (
    <SandboxFileFrame operation="Write" path={args.path}>
      <pre className="max-h-64 overflow-auto p-2.5 font-mono text-xs leading-5 wrap-break-word whitespace-pre-wrap">
        {args.content || (
          <span className="text-muted-foreground italic">Empty file</span>
        )}
      </pre>
    </SandboxFileFrame>
  );
}

function EditToolCallDetails({
  args,
  result,
}: {
  args: z.infer<typeof InAppAgentSandboxEditArgsSchema>;
  result: z.infer<typeof InAppAgentSandboxEditResultSchema> | undefined;
}) {
  return (
    <SandboxFileFrame operation="Edit" path={args.path}>
      <div className="max-h-64 overflow-auto py-1.5 font-mono text-xs leading-5">
        <DiffLines type="removed" value={args.oldText} />
        <DiffLines type="added" value={args.newText} />
      </div>
      {result && !result.replaced ? (
        <SandboxFooter>No matching text found</SandboxFooter>
      ) : null}
    </SandboxFileFrame>
  );
}

function BashToolCallDetails({
  args,
  result,
}: {
  args: z.infer<typeof InAppAgentSandboxBashArgsSchema>;
  result: z.infer<typeof InAppAgentSandboxBashResultSchema> | undefined;
}) {
  return (
    <div className="border-border bg-muted text-foreground max-h-64 overflow-auto rounded-md border p-2.5 font-mono text-xs leading-5 wrap-break-word whitespace-pre-wrap">
      <div>
        <span aria-hidden className="text-muted-foreground select-none">
          ${" "}
        </span>
        <span>{args.command}</span>
      </div>
      {result ? (
        <div>
          {result.stdout}
          {result.stdout && result.stderr && !result.stdout.endsWith("\n")
            ? "\n"
            : null}
          {result.stderr ? (
            <span className="text-destructive">{result.stderr}</span>
          ) : null}
          {!result.stdout && !result.stderr ? (
            <span className="text-muted-foreground italic">No output</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SandboxFileFrame({
  operation,
  path,
  children,
}: {
  operation: "Read" | "Write" | "Edit";
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-muted text-foreground overflow-hidden rounded-md border">
      <div className="border-border flex min-w-0 items-center gap-2 border-b px-2.5 py-2 text-xs">
        <span className="text-muted-foreground shrink-0">{operation}</span>
        <code className="min-w-0 truncate font-mono" title={path}>
          {path}
        </code>
      </div>
      {children}
    </div>
  );
}

function DiffLines({
  type,
  value,
}: {
  type: "removed" | "added";
  value: string;
}) {
  const lines = value.replace(/\n$/, "").split("\n");

  return lines.map((line, index) => (
    <div
      key={`${type}-${index}`}
      className={
        type === "removed"
          ? "flex bg-red-100/80 text-red-900 dark:bg-red-950/60 dark:text-red-200"
          : "flex bg-green-100/80 text-green-900 dark:bg-green-950/60 dark:text-green-200"
      }
    >
      <span
        aria-hidden
        className={
          type === "removed"
            ? "w-7 shrink-0 border-r border-red-300 text-center text-red-600 select-none dark:border-red-900/70 dark:text-red-400"
            : "w-7 shrink-0 border-r border-green-300 text-center text-green-700 select-none dark:border-green-900/70 dark:text-green-400"
        }
      >
        {type === "removed" ? "-" : "+"}
      </span>
      <span className="min-w-0 px-2 wrap-break-word whitespace-pre-wrap">
        {line || " "}
      </span>
    </div>
  ));
}

function SandboxFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border text-muted-foreground border-t px-2.5 py-1.5 font-mono text-[0.6875rem]">
      {children}
    </div>
  );
}

function DefaultToolCallDetails({ tool }: { tool: InAppAgentToolCallContent }) {
  const result = tool.error ?? tool.result;

  return (
    <div className="flex flex-col gap-2">
      <InAppAgentToolPayload
        label="Arguments"
        value={tool.args}
        variant="default"
      />
      {result !== undefined && (
        <InAppAgentToolResultPayload status={tool.status} value={result} />
      )}
    </div>
  );
}

function parseSandboxPayload<TSchema extends z.ZodType>(
  value: string,
  schema: TSchema,
) {
  try {
    return schema.safeParse(JSON.parse(value) as unknown).data;
  } catch {
    return undefined;
  }
}

function parseSandboxResult<TSchema extends z.ZodType>(
  value: string | undefined,
  schema: TSchema,
) {
  if (value === undefined) {
    return { isValid: true, data: undefined } as const;
  }

  const data = parseSandboxPayload(value, schema);
  if (!data) {
    return { isValid: false, data: undefined } as const;
  }

  return { isValid: true, data } as const;
}
