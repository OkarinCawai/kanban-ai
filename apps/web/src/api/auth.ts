const STORAGE_KEYS = {
  supabaseUrl: "kanban.supabaseUrl",
  supabaseKey: "kanban.supabaseKey",
  pkcePrefix: "kanban.pkce."
} as const;

type SupabaseSession = {
  access_token?: string;
  user?: {
    id?: string;
  };
};

export interface SupabaseClientLike {
  auth: {
    getSession: () => Promise<{
      data: { session: SupabaseSession | null };
      error?: { message?: string } | null;
    }>;
    signInWithOAuth: (input: unknown) => Promise<unknown>;
    signOut: () => Promise<{ error?: { message?: string } | null }>;
  };
}

type SupabaseModule = {
  createClient: (
    url: string,
    key: string,
    options: unknown
  ) => SupabaseClientLike;
};

export const persistSupabaseConfig = (url: string, key: string): void => {
  if (url) {
    localStorage.setItem(STORAGE_KEYS.supabaseUrl, url);
  }
  if (key) {
    localStorage.setItem(STORAGE_KEYS.supabaseKey, key);
  }
};

export const hydrateSupabaseConfig = (): { url: string; key: string } => ({
  url: localStorage.getItem(STORAGE_KEYS.supabaseUrl) ?? "",
  key: localStorage.getItem(STORAGE_KEYS.supabaseKey) ?? ""
});

let cachedSupabase: SupabaseClientLike | null = null;
let cachedSupabaseConfig = { url: "", key: "" };

const getSupabaseProjectRef = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const ref = host.split(".")[0];
    return ref ?? "";
  } catch {
    return "";
  }
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

export const getSupabaseClient = async (
  url: string,
  key: string
): Promise<SupabaseClientLike | null> => {
  if (!url || !key) {
    return null;
  }

  if (
    cachedSupabase &&
    cachedSupabaseConfig.url === url &&
    cachedSupabaseConfig.key === key
  ) {
    return cachedSupabase;
  }

  const supabaseCdnUrl =
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.3/+esm";
  const { createClient } = (await import(supabaseCdnUrl)) as SupabaseModule;

  cachedSupabase = createClient(url, key, {
    auth: {
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });
  cachedSupabaseConfig = { url, key };
  return cachedSupabase;
};
