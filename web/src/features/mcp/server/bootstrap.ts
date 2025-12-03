/**
 * MCP Feature Bootstrap
 *
 * Registers all MCP feature modules at application startup.
 * This file is imported once when the server starts to initialize the tool registry.
 *
 * To add a new MCP feature:
 * 1. Create feature module in /features/[feature-name]/
 * 2. Import feature module here
 * 3. Call toolRegistry.register(featureModule)
 */

import { toolRegistry } from "./registry";
import { promptsFeature } from "../features/prompts";
// Import future features as they're added:
// import { datasetsFeature } from "../features/datasets";
// import { tracesFeature } from "../features/traces";
// import { evalsFeature } from "../features/evals";

/**
 * Bootstrap all MCP features
 *
 * Called once at application startup to register all MCP feature modules.
 * Features are registered in order of dependency (if any exist).
 */
export function bootstrapMcpFeatures(): void {
  // Register all feature modules
  toolRegistry.register(promptsFeature);

  // Add future features here:
  // toolRegistry.register(datasetsFeature);
  // toolRegistry.register(tracesFeature);
  // toolRegistry.register(evalsFeature);
}

/**
 * Auto-bootstrap when this module is imported
 *
 * This runs once when the server starts, ensuring tools are registered
 * before any MCP requests are handled.
 */
bootstrapMcpFeatures();
