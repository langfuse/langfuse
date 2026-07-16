import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { CodeBlock } from "@/src/components/ui/Codeblock";
import Link from "next/link";
import { Bot, SquareTerminal, Sparkles } from "lucide-react";

const DocsButton = ({ href }: { href: string }) => (
  <Button asChild variant="ghost">
    <Link href={href} target="_blank">
      Documentation ↗
    </Link>
  </Button>
);

const ManageApiKeysButton = ({ projectId }: { projectId: string }) => (
  <Button asChild variant="secondary">
    <Link href={`/project/${projectId}/settings/api-keys`}>
      Manage API keys
    </Link>
  </Button>
);

export function DeveloperToolsSettings({ projectId }: { projectId: string }) {
  return (
    <div>
      <Header title="MCP & CLI" />
      <p className="text-muted-foreground mb-6 text-sm">
        Bring Langfuse into your terminal and AI coding agents. These tools let
        you and your agents read and write Langfuse data—traces, prompts,
        datasets, scores, and more—without leaving your development environment.
      </p>
      <div className="space-y-6">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="text-foreground h-5 w-5" />
            <span className="font-semibold">Agent Skill</span>
          </div>
          <p className="text-primary mb-4 text-sm">
            The Langfuse Agent Skill is an open-source skill following
            Anthropic&apos;s Agent Skills standard. It equips AI coding agents
            (Claude Code, Cursor, Windsurf) with native Langfuse capabilities
            and conditions them to follow best practices, so agents produce
            better results when it is installed.
          </p>
          <CodeBlock
            language="shell"
            value={`npx skills add langfuse/skills --skill "langfuse"`}
          />
          <div className="mt-4 flex items-center gap-2">
            <DocsButton href="https://langfuse.com/docs/api-and-data-platform/features/agent-skill" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="text-foreground h-5 w-5" />
            <span className="font-semibold">MCP Server</span>
          </div>
          <p className="text-primary mb-4 text-sm">
            The Langfuse MCP server lets AI assistants and agents interact with
            your Langfuse data programmatically via the Model Context Protocol.
            It supports both read and write operations, and you can restrict it
            to read-only access with an allowlist. Authenticate with a
            project-scoped API key pair.
          </p>
          <CodeBlock
            language="shell"
            value={`claude mcp add --transport http langfuse \\
  https://cloud.langfuse.com/api/public/mcp \\
  --header "Authorization: Basic {your-base64-token}"`}
          />
          <div className="mt-4 flex items-center gap-2">
            <ManageApiKeysButton projectId={projectId} />
            <DocsButton href="https://langfuse.com/docs/api-and-data-platform/features/mcp-server" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <SquareTerminal className="text-foreground h-5 w-5" />
            <span className="font-semibold">CLI</span>
          </div>
          <p className="text-primary mb-4 text-sm">
            The Langfuse CLI provides terminal access to the full Langfuse API.
            It wraps every API endpoint, so you can manage traces, prompts,
            datasets, scores, and sessions directly from your shell or scripts.
            It uses the same API key pair as the Langfuse SDKs.
          </p>
          <CodeBlock
            language="shell"
            value={`export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_SECRET_KEY="sk-lf-..."

npx langfuse-cli api <resource> <action>`}
          />
          <div className="mt-4 flex items-center gap-2">
            <ManageApiKeysButton projectId={projectId} />
            <DocsButton href="https://langfuse.com/docs/api-and-data-platform/features/cli" />
          </div>
        </Card>
      </div>
    </div>
  );
}
