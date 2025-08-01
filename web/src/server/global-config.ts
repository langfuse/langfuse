/**
 * Global configuration for dynamic Supabase credentials
 * Allows switching between different project configurations at runtime
 */

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export interface DjbBackendConfig {
  url: string;
  authKey: string;
}

class GlobalConfig {
  private _supabaseConfig: SupabaseConfig | null = null;
  private _djbBackendConfig: DjbBackendConfig | null = null;

  /**
   * Set the active Supabase configuration
   */
  setSupabaseConfig(config: SupabaseConfig): void {
    this._supabaseConfig = config;
  }

  /**
   * Get the current Supabase configuration
   * Falls back to environment variables if no config is set
   */
  getSupabaseConfig(): SupabaseConfig {
    if (this._supabaseConfig) {
      return this._supabaseConfig;
    }

    // Fallback to environment variables
    return {
      url: process.env.SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    };
  }

  /**
   * Clear the current configuration (will fall back to env vars)
   */
  clearSupabaseConfig(): void {
    this._supabaseConfig = null;
  }

  /**
   * Check if a custom configuration is currently set
   */
  hasCustomSupabaseConfig(): boolean {
    return this._supabaseConfig !== null;
  }

  /**
   * Set the active DJB backend configuration
   */
  setDjbBackendConfig(config: DjbBackendConfig): void {
    this._djbBackendConfig = config;
  }

  /**
   * Get the current DJB backend configuration
   * Falls back to environment variables if no config is set
   */
  getDjbBackendConfig(): DjbBackendConfig {
    if (this._djbBackendConfig) {
      return this._djbBackendConfig;
    }

    // Fallback to environment variables
    return {
      url: process.env.DJB_BACKEND_URL || "http://localhost:8000",
      authKey: process.env.DJB_BACKEND_AUTH_KEY || "dev",
    };
  }

  /**
   * Clear the current DJB backend configuration (will fall back to env vars)
   */
  clearDjbBackendConfig(): void {
    this._djbBackendConfig = null;
  }

  /**
   * Check if a custom DJB backend configuration is currently set
   */
  hasCustomDjbBackendConfig(): boolean {
    return this._djbBackendConfig !== null;
  }
}

// Export a singleton instance
export const globalConfig = new GlobalConfig();
