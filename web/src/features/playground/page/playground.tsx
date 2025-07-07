import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "./context";
import { Variables } from "./components/Variables";
import { MessagePlaceholders } from "./components/MessagePlaceholders";
import { Messages } from "./components/Messages";
import {
  PlaygroundTools,
  PlaygroundToolsPopover,
} from "./components/PlaygroundTools";
import {
  StructuredOutputSchemaSection,
  StructuredOutputSchemaPopover,
} from "./components/StructuredOutputSchemaSection";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { Button } from "@/src/components/ui/button";
import { Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

export default function Playground() {
  const playgroundContext = usePlaygroundContext();
  const {
    tools,
    structuredOutputSchema,
    promptVariables,
    messagePlaceholders,
    modelParams,
  } = playgroundContext;

  // Generate enhanced summaries for collapsed sections
  const toolsSummary =
    tools.length > 0
      ? `${tools.length} tool${tools.length === 1 ? "" : "s"}: ${tools.map((t) => t.name).join(", ")}`
      : "No tools attached";

  const schemaName = structuredOutputSchema?.name;
  const structuredOutputSummary = schemaName
    ? `Schema: ${schemaName}`
    : "No schema provided";

  const variableNames = promptVariables
    .filter((v) => v.isUsed)
    .map((v) => v.name);
  const placeholderNames = messagePlaceholders
    .filter((p) => p.isUsed)
    .map((p) => p.name);
  const allConfigured = [...variableNames, ...placeholderNames];

  const variablesAndPlaceholdersSummary =
    allConfigured.length > 0
      ? `${allConfigured.length} configured: ${allConfigured.join(", ")}`
      : "No variables or placeholders defined";

  // Generate overall configuration summary when collapsed
  const configSummary = () => {
    const parts = [];

    // Model info
    if (modelParams?.model) {
      parts.push(`Model: ${modelParams.model.value}`);
    }

    // Tools count
    if (tools.length > 0) {
      parts.push(`${tools.length} tool${tools.length === 1 ? "" : "s"}`);
    }

    // Schema info
    if (structuredOutputSchema) {
      parts.push(`Schema: ${structuredOutputSchema.name}`);
    }

    // Variables and placeholders
    if (allConfigured.length > 0) {
      parts.push(
        `${allConfigured.length} variable${allConfigured.length === 1 ? "" : "s"}`,
      );
    }

    return parts.length > 0 ? parts.join(" • ") : "Default configuration";
  };

  return (
    <div className="flex h-full flex-col">
      {/* Configuration Panel - Now Collapsible */}
      <div className="flex-shrink-0 border-b">
        <CollapsibleSection
          title="Model Configuration"
          defaultExpanded={true}
          summaryContent={configSummary()}
          className="bg-muted/20 p-4"
        >
          <div className="space-y-3">
            {/* Model Parameters - Compact layout for space efficiency */}
            <ModelParameters
              {...playgroundContext}
              customHeader={<div />}
              layout="compact"
            />

            {/* Tools Section - Collapsible */}
            <CollapsibleSection
              title="Tools"
              badge="Beta"
              count={tools.length}
              defaultExpanded={false}
              isEmpty={tools.length === 0}
              emptyMessage="No tools attached."
              summaryContent={toolsSummary}
              actionButton={
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-1">
                    <PlaygroundToolsPopover />
                  </PopoverContent>
                </Popover>
              }
            >
              <PlaygroundTools />
            </CollapsibleSection>

            {/* Structured Output Section - Collapsible */}
            <CollapsibleSection
              title="Structured Output"
              badge="Beta"
              count={structuredOutputSchema ? 1 : 0}
              defaultExpanded={false}
              isEmpty={!structuredOutputSchema}
              emptyMessage="No schema provided."
              summaryContent={structuredOutputSummary}
              actionButton={
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-1">
                    <StructuredOutputSchemaPopover />
                  </PopoverContent>
                </Popover>
              }
            >
              <StructuredOutputSchemaSection />
            </CollapsibleSection>

            {/* Variables & Message Placeholders - Combined Section */}
            <CollapsibleSection
              title="Variables & Message Placeholders"
              count={promptVariables.length + messagePlaceholders.length}
              defaultExpanded={false}
              isEmpty={
                promptVariables.length === 0 && messagePlaceholders.length === 0
              }
              emptyMessage="No variables or message placeholders defined."
              summaryContent={variablesAndPlaceholdersSummary}
            >
              <div className="space-y-4">
                <Variables />
                <MessagePlaceholders />
              </div>
            </CollapsibleSection>
          </div>
        </CollapsibleSection>
      </div>

      {/* Messages and Output - Below configuration */}
      <div className="flex-1 overflow-auto p-4">
        <Messages {...playgroundContext} />
      </div>
    </div>
  );
}
