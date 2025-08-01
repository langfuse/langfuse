import { globalConfig, type SupabaseConfig, type DjbBackendConfig } from "./global-config";

/**
 * Project-specific configuration utilities
 * Use these functions to switch between different project environments
 */

export interface ProjectConfig {
  id: string;
  name: string;
  supabase: SupabaseConfig;
  djbBackend: DjbBackendConfig;
}

/**
 * Set the active project configuration
 * This will update the global Supabase and DJB backend credentials
 */
export function setActiveProject(project: ProjectConfig): void {
  globalConfig.setSupabaseConfig(project.supabase);
  globalConfig.setDjbBackendConfig(project.djbBackend);
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
  globalConfig.clearDjbBackendConfig();
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

/**
 * Set DJB backend configuration directly
 * Use this when you have the credentials but not a full project config
 */
export function setDjbBackendCredentials(
  url: string,
  authKey: string,
): void {
  globalConfig.setDjbBackendConfig({ url, authKey });
}

/**
 * Get current DJB backend configuration
 */
export function getCurrentDjbBackendConfig(): DjbBackendConfig {
  return globalConfig.getDjbBackendConfig();
}

/**
 * Check if we're using custom DJB backend credentials
 */
export function isUsingCustomDjbBackendConfig(): boolean {
  return globalConfig.hasCustomDjbBackendConfig();
}

// Project environment configurations (you can customize these)
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
    djbBackend: {
      url: process.env.DJB_BACKEND_URL_DEV || process.env.DJB_BACKEND_URL || "http://localhost:8000",
      authKey: process.env.DJB_BACKEND_AUTH_KEY_DEV || process.env.DJB_BACKEND_AUTH_KEY || "dev",
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
    djbBackend: {
      url: process.env.DJB_BACKEND_URL_PROD || process.env.DJB_BACKEND_URL || "http://localhost:8000",
      authKey: process.env.DJB_BACKEND_AUTH_KEY_PROD || process.env.DJB_BACKEND_AUTH_KEY || "dev",
    },
  },
};
