import { createClient } from "@supabase/supabase-js";
import { globalConfig } from "./global-config";

export function createSupabaseAdminClient() {
  const config = globalConfig.getSupabaseConfig();

  return createClient(config.url, config.serviceRoleKey);
}
