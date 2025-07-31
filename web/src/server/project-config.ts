import { globalConfig, type SupabaseConfig } from "./global-config";

/**
 * Project-specific configuration utilities
 * Use these functions to switch between different project environments
 */

export interface ProjectConfig {
  id: string;
  name: string;
  supabase: SupabaseConfig;
}

/**
 * Set the active project configuration
 * This will update the global Supabase credentials
 */
export function setActiveProject(project: ProjectConfig): void {
  globalConfig.setSupabaseConfig(project.supabase);
}

/**
 * Set Supabase configuration directly
 * Use this when you have the credentials but not a full project config
 */
export function setSupabaseCredentials(
  url: string,
  serviceRoleKey: string,
): void {
  globalConfig.setSupabaseConfig({ url, serviceRoleKey });
}

/**
 * Reset to default environment-based configuration
 */
export function resetToDefaultConfig(): void {
  globalConfig.clearSupabaseConfig();
}

/**
 * Check if we're using custom project credentials
 */
export function isUsingCustomConfig(): boolean {
  return globalConfig.hasCustomSupabaseConfig();
}

/**
 * Get current Supabase configuration
 */
export function getCurrentSupabaseConfig(): SupabaseConfig {
  return globalConfig.getSupabaseConfig();
}

// Supabase environment configurations (you can customize these)
export const SUPABASE_ENVIRONMENTS: Record<string, ProjectConfig> = {
  development: {
    id: "dev",
    name: "Development",
    supabase: {
      url: process.env.SUPABASE_URL_DEV || process.env.SUPABASE_URL!,
      serviceRoleKey:
        process.env.SUPABASE_SERVICE_ROLE_KEY_DEV ||
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
  production: {
    id: "prod",
    name: "Production",
    supabase: {
      url: process.env.SUPABASE_URL_PROD || process.env.SUPABASE_URL!,
      serviceRoleKey:
        process.env.SUPABASE_SERVICE_ROLE_KEY_PROD ||
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
};
