import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeSecrets } from "@kanban/utils";

export const createSupabaseServiceClientFromEnv = (): SupabaseClient => {
  const secrets = loadRuntimeSecrets();
  const key = secrets.supabaseServiceRoleKey?.trim();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service storage operations.");
  }

  return createClient(secrets.supabaseUrl, key, {
    auth: {
      persistSession: false
    }
  });
};

