import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeSecrets } from "@kanban/utils";

export const createSupabaseClientFromEnv = (): SupabaseClient => {
  const secrets = loadRuntimeSecrets();

  return createClient(secrets.supabaseUrl, secrets.supabasePublishableKey, {
    auth: {
      persistSession: false
    }
  });
};
