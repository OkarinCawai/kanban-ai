export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLog {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export const formatStructuredLog = (entry: StructuredLog): string => {
  const base = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  return JSON.stringify(base);
};

export interface RuntimeSecrets {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceRoleKey?: string;
  supabaseDbUrl?: string;
  geminiApiKey: string;
}

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const requireEnv = (
  env: NodeJS.ProcessEnv,
  key: string
): string => {
  const value = trimToUndefined(env[key]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const loadRuntimeSecrets = (
  env: NodeJS.ProcessEnv = process.env
): RuntimeSecrets => {
  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  const supabasePublishableKey = requireEnv(env, "SUPABASE_PUBLISHABLE_KEY");
  const geminiApiKey = requireEnv(env, "GEMINI_API_KEY");

  return {
    supabaseUrl,
    supabasePublishableKey,
    supabaseServiceRoleKey: trimToUndefined(env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseDbUrl: trimToUndefined(env.SUPABASE_DB_URL),
    geminiApiKey
  };
};
