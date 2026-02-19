/**
 * MCP Tool Registry
 *
 * Global registry for MCP feature modules and their tools.
 * Provides dynamic tool discovery and execution.
 *
 * Design Pattern:
 * - Each feature domain (prompts, datasets, traces) registers as a module
 * - Registry handles tool name conflicts and feature-level enablement
 * - Server queries registry instead of hardcoding tool lists
 */

import type { ToolDefinition, ToolHandler } from "../core/define-tool";
import type { ServerContext } from "../types";
import { logger } from "@langfuse/shared/src/server";

/**
 * Registered MCP tool
 *
 * Combines tool definition (for MCP protocol) with handler (for execution)
 */
export interface RegisteredTool {
  /** Tool definition for MCP protocol */
  definition: ToolDefinition;

  /** Tool handler function - accepts any input type */

  handler: ToolHandler<any>;
}

/**
 * Feature module definition
 *
 * Each feature domain (prompts, datasets, traces) exports a feature module
 * that registers its tools with the MCP server.
 *
 * @example
 * ```typescript
 * export const promptsFeature: McpFeatureModule = {
 *   name: "prompts",
 *   description: "Manage Langfuse prompts",
 *   tools: [
 *     { definition: getPromptTool, handler: handleGetPrompt },
 *     { definition: listPromptsTool, handler: handleListPrompts },
 *   ],
 * };
 * ```
 */
export interface McpFeatureModule {
  /** Feature identifier (e.g., 'prompts', 'datasets') */
  name: string;

  /** Feature description */
  description: string;

  /** Tools provided by this feature */
  tools: RegisteredTool[];

  /**
   * Optional: Check if feature is enabled for the given context
   * Allows conditional feature availability based on entitlements, feature flags, etc.
   */
  isEnabled?: (context: ServerContext) => boolean | Promise<boolean>;
}

/**
 * Global tool registry
 *
 * Manages registration and lookup of MCP tools across all features.
 * Singleton pattern ensures consistent state across application.
 */
class ToolRegistry {
  private features = new Map<string, McpFeatureModule>();
  private tools = new Map<string, RegisteredTool>();

  /**
   * Register a feature module with its tools
   *
   * @param feature - Feature module to register
   * @throws Error if feature name conflicts or tool name conflicts
   */
  register(feature: McpFeatureModule): void {
    if (this.features.has(feature.name)) {
      throw new Error(`Feature '${feature.name}' is already registered`);
    }

    // Validate no tool name conflicts
    for (const tool of feature.tools) {
      if (this.tools.has(tool.definition.name)) {
        const existingFeature = this.getToolFeature(tool.definition.name);
        throw new Error(
          `Tool '${tool.definition.name}' from feature '${feature.name}' ` +
            `conflicts with existing tool from feature '${existingFeature}'`,
        );
      }
    }

    // Register feature and its tools
    this.features.set(feature.name, feature);
    for (const tool of feature.tools) {
      this.tools.set(tool.definition.name, tool);
    }

    logger.info(`MCP feature registered: ${feature.name}`, {
      featureName: feature.name,
      toolCount: feature.tools.length,
      toolNames: feature.tools.map((t) => t.definition.name),
    });
  }

  /**
   * Get all registered tool definitions (for ListTools handler)
   *
   * @param context - Server context for feature enablement checks
   * @returns Array of tool definitions from enabled features
   */
  async getToolDefinitions(context: ServerContext): Promise<ToolDefinition[]> {
    const definitions: ToolDefinition[] = [];

    for (const feature of this.features.values()) {
      // Check if feature is enabled for this context
      if (feature.isEnabled && !(await feature.isEnabled(context))) {
        continue;
      }

      // Add all tools from enabled feature
      for (const tool of feature.tools) {
        definitions.push(tool.definition);
      }
    }

    return definitions;
  }

  /**
   * Get tool handler by name (for CallTool handler)
   *
   * @param name - Tool name to lookup
   * @returns Registered tool or undefined if not found
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get feature name for a tool (for error messages)
   *
   * @param toolName - Tool name to lookup
   * @returns Feature name or "unknown"
   */
  private getToolFeature(toolName: string): string {
    for (const [featureName, feature] of this.features.entries()) {
      if (feature.tools.some((t) => t.definition.name === toolName)) {
        return featureName;
      }
    }
    return "unknown";
  }

  /**
   * Get all registered features
   *
   * @returns Array of all feature modules
   */
  getFeatures(): McpFeatureModule[] {
    return Array.from(this.features.values());
  }

  /**
   * Get feature count (for diagnostics)
   */
  getFeatureCount(): number {
    return this.features.size;
  }

  /**
   * Get tool count (for diagnostics)
   */
  getToolCount(): number {
    return this.tools.size;
  }
}

/**
 * Global singleton registry instance
 *
 * Exported for use across the application.
 * Features register themselves at module load time.
 */
export const toolRegistry = new ToolRegistry();
