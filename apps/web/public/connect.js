const state = {
  accessToken: null,
  authUserId: null
};

const dom = {
  supabaseUrl: document.getElementById("supabaseUrl"),
  supabaseKey: document.getElementById("supabaseKey"),
  loginDiscordBtn: document.getElementById("loginDiscordBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  resetAuthBtn: document.getElementById("resetAuthBtn"),
  authUserId: document.getElementById("authUserId"),
  discordUserId: document.getElementById("discordUserId"),
  linkBtn: document.getElementById("linkBtn"),
  log: document.getElementById("log")
};

const STORAGE_KEYS = {
  supabaseUrl: "kanban.supabaseUrl",
  supabaseKey: "kanban.supabaseKey",
  pkcePrefix: "kanban.pkce.",
  authReturnTo: "kanban.auth.returnTo"
};

const log = (message, payload) => {
  const line = payload
    ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(payload)}`
    : `[${new Date().toISOString()}] ${message}`;
  dom.log.textContent = `${line}\n${dom.log.textContent}`.trim();
};

const persistSupabaseConfig = () => {
  const url = dom.supabaseUrl.value.trim();
  const key = dom.supabaseKey.value.trim();

  if (url) {
    localStorage.setItem(STORAGE_KEYS.supabaseUrl, url);
  }
  if (key) {
    localStorage.setItem(STORAGE_KEYS.supabaseKey, key);
  }
};

const hydrateSupabaseConfig = () => {
  const url = localStorage.getItem(STORAGE_KEYS.supabaseUrl);
  const key = localStorage.getItem(STORAGE_KEYS.supabaseKey);

  if (url && !dom.supabaseUrl.value.trim()) {
    dom.supabaseUrl.value = url;
  }
  if (key && !dom.supabaseKey.value.trim()) {
    dom.supabaseKey.value = key;
  }
};

const getSupabaseProjectRef = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const ref = host.split(".")[0];
    return ref ?? "";
  } catch {
    return "";
  }
};

const getSupabaseStorageKey = (supabaseUrl) => {
  const ref = getSupabaseProjectRef(supabaseUrl);
  return ref ? `sb-${ref}-auth-token` : "";
};

const getSupabaseCodeVerifierKey = (supabaseUrl) => {
  const storageKey = getSupabaseStorageKey(supabaseUrl);
  return storageKey ? `${storageKey}-code-verifier` : "";
};

const clearSupabaseAuthStorage = (supabaseUrl) => {
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

const normalizeMaybeJsonString = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
};

let cachedSupabase = null;
let cachedSupabaseConfig = { url: "", key: "" };

const getSupabaseClient = async () => {
  const url = dom.supabaseUrl.value.trim();
  const key = dom.supabaseKey.value.trim();

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

  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.3/+esm"
  );

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

const refreshAuthState = async () => {
  const supabase = await getSupabaseClient();

  state.accessToken = null;
  state.authUserId = null;

  if (!supabase) {
    dom.authUserId.textContent = "Not signed in";
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) {
    dom.authUserId.textContent = "Not signed in";
    return;
  }

  state.accessToken = data.session.access_token;
  state.authUserId = data.session.user?.id ?? null;
  dom.authUserId.textContent = state.authUserId ?? "Unknown";
};

const parseDiscordUserId = () => {
  const params = new URLSearchParams(window.location.search);
  const value = (params.get("discord_user_id") ?? "").trim();
  return value.length > 0 ? value : null;
};

hydrateSupabaseConfig();
const discordUserId = parseDiscordUserId();
dom.discordUserId.textContent = discordUserId ?? "Missing ?discord_user_id=...";

refreshAuthState().catch((error) => log("Auth refresh failed", { message: error.message }));

dom.supabaseUrl.addEventListener("change", () => {
  persistSupabaseConfig();
  refreshAuthState().catch((error) => log("Auth refresh failed", { message: error.message }));
});

dom.supabaseKey.addEventListener("change", () => {
  persistSupabaseConfig();
  refreshAuthState().catch((error) => log("Auth refresh failed", { message: error.message }));
});

dom.loginDiscordBtn.addEventListener("click", async () => {
  if (dom.loginDiscordBtn.disabled) {
    return;
  }

  dom.loginDiscordBtn.disabled = true;
  try {
    if (!discordUserId) {
      log("Missing discord_user_id in URL. Use the /connect link from Discord.");
      return;
    }

    persistSupabaseConfig();
    const supabase = await getSupabaseClient();
    if (!supabase) {
      log("Set Supabase URL + Publishable Key before signing in.");
      return;
    }

    // After callback code exchange, return user here.
    const returnTo = `/connect.html?discord_user_id=${encodeURIComponent(discordUserId)}`;
    localStorage.setItem(STORAGE_KEYS.authReturnTo, returnTo);

    const pkceId = crypto.randomUUID();
    const redirectUrl = new URL(`/auth/callback.html`, window.location.origin);
    redirectUrl.hash = `pkce_id=${encodeURIComponent(pkceId)}`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: redirectUrl.toString(),
        skipBrowserRedirect: true
      }
    });
    if (error) {
      throw error;
    }

    const verifierKey = getSupabaseCodeVerifierKey(dom.supabaseUrl.value.trim());
    const verifierRaw =
      (verifierKey ? localStorage.getItem(verifierKey) : null) ??
      (verifierKey ? sessionStorage.getItem(verifierKey) : null);
    const verifier = normalizeMaybeJsonString(verifierRaw);

    if (verifier) {
      localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}`, verifier);
      localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}latest`, pkceId);
    } else {
      log("PKCE verifier not found in storage; exchange may fail.", { verifierKey });
    }

    if (!data?.url) {
      throw new Error("Supabase did not return an OAuth URL.");
    }

    window.location.assign(data.url);
  } catch (error) {
    log("Discord sign-in failed", { message: error.message });
  } finally {
    dom.loginDiscordBtn.disabled = false;
  }
});

dom.logoutBtn.addEventListener("click", async () => {
  try {
    const supabase = await getSupabaseClient();
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      log("Logout failed", { message: error.message });
      return;
    }

    await refreshAuthState();
    log("Logged out.");
  } catch (error) {
    log("Logout failed", { message: error.message });
  }
});

dom.resetAuthBtn.addEventListener("click", async () => {
  try {
    persistSupabaseConfig();
    const url = dom.supabaseUrl.value.trim();
    const removed = clearSupabaseAuthStorage(url);

    cachedSupabase = null;
    cachedSupabaseConfig = { url: "", key: "" };
    await refreshAuthState();

    log("Cleared Supabase auth storage.", { removedKeys: removed });
  } catch (error) {
    log("Reset auth failed", { message: error.message });
  }
});

dom.linkBtn.addEventListener("click", async () => {
  try {
    if (!discordUserId) {
      log("Missing discord_user_id in URL. Use the /connect link from Discord.");
      return;
    }

    const supabase = await getSupabaseClient();
    if (!supabase) {
      log("Set Supabase URL + Publishable Key first.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user?.id) {
      log("Not signed in. Click Sign in with Discord first.");
      return;
    }
    const { data: authUserData, error: authUserError } = await supabase.auth.getUser();
    const authUserId = authUserData?.user?.id ?? null;
    if (authUserError || !authUserId) {
      log(
        "Supabase session is stale or invalid. Click Logout, then Sign in with Discord again.",
        { message: authUserError?.message ?? "Unknown auth error" }
      );
      return;
    }
    if (authUserId !== user.id) {
      log("Session user changed after validation. Using refreshed auth user.", {
        fromSession: user.id,
        fromGetUser: authUserId
      });
    }

    const { data: existingIdentity, error: existingIdentityError } = await supabase
      .from("discord_identities")
      .select("discord_user_id")
      .eq("user_id", authUserId)
      .maybeSingle();

    if (existingIdentityError) {
      log("Could not check existing Discord link.", {
        message: existingIdentityError.message
      });
      return;
    }

    if (existingIdentity?.discord_user_id === discordUserId) {
      log("Discord identity already linked for this user. Return to Discord and run /my tasks.");
      return;
    }

    if (existingIdentity?.discord_user_id && existingIdentity.discord_user_id !== discordUserId) {
      log("This Supabase user is already linked to a different Discord account.", {
        linkedDiscordUserId: existingIdentity.discord_user_id,
        expectedFromCommand: discordUserId
      });
      return;
    }

    const {
      data: providerDiscordUserId,
      error: providerLookupError
    } = await supabase.rpc("current_user_discord_provider_id");

    if (providerLookupError) {
      log("Could not verify Discord account for current session.", {
        message: providerLookupError.message
      });
      return;
    }

    if (!providerDiscordUserId) {
      log(
        "Current Supabase session has no Discord identity. Logout, then sign in with Discord and try again."
      );
      return;
    }

    if (providerDiscordUserId !== discordUserId) {
      log("Discord identity mismatch detected.", {
        expectedFromCommand: discordUserId,
        signedInDiscordUserId: providerDiscordUserId
      });
      log("Logout, sign in with the same Discord account that ran /connect, then retry.");
      return;
    }

    const { error } = await supabase
      .from("discord_identities")
      .upsert(
        {
          discord_user_id: discordUserId,
          user_id: authUserId
        },
        { onConflict: "user_id" }
      );

    if (error) {
      log("Link failed", { message: error.message, details: error.details });
      return;
    }

    log("Discord identity linked. Return to Discord and run /my tasks.");
  } catch (error) {
    log("Link failed", { message: error.message });
  }
});
