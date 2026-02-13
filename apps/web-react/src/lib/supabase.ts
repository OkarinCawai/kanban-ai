import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const STORAGE_KEYS = {
  supabaseUrl: "kanban.supabaseUrl",
  supabaseKey: "kanban.supabaseKey",
  pkcePrefix: "kanban.pkce.",
  authReturnTo: "kanban.auth.returnTo"
} as const;

export const normalizeMaybeJsonString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
};

export const getSupabaseProjectRef = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const ref = host.split(".")[0];
    return ref ?? "";
  } catch {
    return "";
  }
};

export const getSupabaseStorageKey = (supabaseUrl: string): string => {
  const ref = getSupabaseProjectRef(supabaseUrl);
  return ref ? `sb-${ref}-auth-token` : "";
};

export const getSupabaseCodeVerifierKey = (supabaseUrl: string): string => {
  const storageKey = getSupabaseStorageKey(supabaseUrl);
  return storageKey ? `${storageKey}-code-verifier` : "";
};

export const readCodeVerifier = (supabaseUrl: string): string | null => {
  const verifierKey = getSupabaseCodeVerifierKey(supabaseUrl);
  if (!verifierKey) {
    return null;
  }

  const localRaw = localStorage.getItem(verifierKey);
  const sessionRaw = sessionStorage.getItem(verifierKey);
  return normalizeMaybeJsonString(localRaw ?? sessionRaw) ?? null;
};

export const clearSupabaseAuthStorage = (supabaseUrl: string): number => {
  const ref = getSupabaseProjectRef(supabaseUrl);
  let removed = 0;

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_KEYS.pkcePrefix)) {
      localStorage.removeItem(key);
      removed += 1;
    }
  }

  if (!ref) {
    return removed;
  }

  const prefix = `sb-${ref}-`;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(prefix)) {
      localStorage.removeItem(key);
      removed += 1;
    }
  }

  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(prefix)) {
      sessionStorage.removeItem(key);
      removed += 1;
    }
  }

  return removed;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfig = { url: "", key: "" };

export const getSupabaseClient = (
  url: string,
  key: string
): SupabaseClient | null => {
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();
  if (!trimmedUrl || !trimmedKey) {
    return null;
  }

  if (
    cachedClient &&
    cachedConfig.url === trimmedUrl &&
    cachedConfig.key === trimmedKey
  ) {
    return cachedClient;
  }

  cachedClient = createClient(trimmedUrl, trimmedKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });
  cachedConfig = { url: trimmedUrl, key: trimmedKey };
  return cachedClient;
};

