/**
 * Global configuration for dynamic Supabase credentials
 * Allows switching between different project configurations at runtime
 */

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

class GlobalConfig {
  private _supabaseConfig: SupabaseConfig | null = null;

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
}

// Export a singleton instance
export const globalConfig = new GlobalConfig();
