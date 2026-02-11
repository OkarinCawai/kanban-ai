const statusEl = document.getElementById("status");

const STORAGE_KEYS = {
  supabaseUrl: "kanban.supabaseUrl",
  supabaseKey: "kanban.supabaseKey",
  pkcePrefix: "kanban.pkce.",
  authReturnTo: "kanban.auth.returnTo"
};

const setStatus = (message, payload) => {
  const line = payload ? `${message}\n${JSON.stringify(payload, null, 2)}` : message;
  statusEl.textContent = line;
};

const computePkceChallenge = async (rawVerifier, method) => {
  if (method === "plain") {
    return rawVerifier;
  }

  const hasCryptoSupport =
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof TextEncoder !== "undefined";

  if (!hasCryptoSupport) {
    // Fallback to plain if WebCrypto isn't available.
    return rawVerifier;
  }

  const encoder = new TextEncoder();
  const encodedData = encoder.encode(rawVerifier);
  const hash = await crypto.subtle.digest("SHA-256", encodedData);
  const bytes = new Uint8Array(hash);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

const supabaseUrl = (localStorage.getItem(STORAGE_KEYS.supabaseUrl) ?? "").trim();
const supabaseKey = (localStorage.getItem(STORAGE_KEYS.supabaseKey) ?? "").trim();

if (!supabaseUrl || !supabaseKey) {
  setStatus(
    "Missing Supabase URL / Publishable Key in localStorage. Return to the board and set them first."
  );
} else {
  // Pin the version so auth flows don't break due to CDN "latest" changes.
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.3/+esm"
  );

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const pkceIdFromUrl =
    query.get("state") ??
    hash.get("state") ??
    query.get("pkce_id") ??
    hash.get("pkce_id");
  const pkceId = pkceIdFromUrl ?? localStorage.getItem(`${STORAGE_KEYS.pkcePrefix}latest`);
  const pkceSnapshotKey = pkceId ? `${STORAGE_KEYS.pkcePrefix}${pkceId}` : null;

  const debugInfo = {
    has_code: Boolean(query.get("code") ?? hash.get("code")),
    has_state: Boolean(query.get("state") ?? hash.get("state")),
    has_pkce_id: Boolean(query.get("pkce_id") ?? hash.get("pkce_id")),
    used_pkce_id: pkceId ?? null,
    pkce_snapshot_found: null,
    stored_challenge_prefix: null,
    computed_challenge_prefix: null,
    challenge_method: null,
    challenge_match: null,
    verifier_length: null
  };

  if (pkceId) {
    const verifierSnapshotRaw = pkceSnapshotKey ? localStorage.getItem(pkceSnapshotKey) : null;
    const verifierSnapshot = normalizeMaybeJsonString(verifierSnapshotRaw);
    const storedChallenge = localStorage.getItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.challenge`);
    const storedMethod = localStorage.getItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.method`) ?? "s256";

    debugInfo.challenge_method = storedMethod;
    if (storedChallenge) {
      debugInfo.stored_challenge_prefix = storedChallenge.slice(0, 12);
    }

    if (verifierSnapshot) {
      const verifierKey = getSupabaseCodeVerifierKey(supabaseUrl);
      if (verifierKey) {
        // auth-js reads `${storageKey}-code-verifier` during exchangeCodeForSession.
        // Store as a raw string. This works across auth-js versions (some JSON-stringify storage,
        // some store raw), because getItemAsync falls back to raw when JSON.parse fails.
        localStorage.setItem(verifierKey, verifierSnapshot);
        sessionStorage.setItem(verifierKey, verifierSnapshot);
      }

      debugInfo.pkce_snapshot_found = true;
      debugInfo.verifier_length = verifierSnapshot.length;
      try {
        const computedChallenge = await computePkceChallenge(verifierSnapshot, storedMethod);
        debugInfo.computed_challenge_prefix = computedChallenge.slice(0, 12);
        debugInfo.challenge_match = storedChallenge ? computedChallenge === storedChallenge : null;
      } catch {
        // Ignore crypto failures; exchange will fail anyway if PKCE can't be computed.
      }

      // Keep snapshots on error for debugging; Reset Auth clears them.
    } else {
      debugInfo.pkce_snapshot_found = false;
    }
  } else {
    debugInfo.pkce_snapshot_found = false;
  }

  const error =
    query.get("error") ??
    query.get("error_code") ??
    query.get("error_description") ??
    hash.get("error") ??
    hash.get("error_code") ??
    hash.get("error_description");

  if (error) {
    const payload = {
      error: query.get("error") ?? hash.get("error"),
      error_code: query.get("error_code") ?? hash.get("error_code"),
      error_description: query.get("error_description") ?? hash.get("error_description")
    };

    const desc = payload.error_description ?? "";
    if (/unable to exchange external code/i.test(desc)) {
      setStatus(
        "Supabase OAuth couldn't exchange the Discord authorization code. This is usually a Discord app config issue (Client Secret / Redirects / Public Client).",
        payload
      );
    } else {
      setStatus("Supabase OAuth returned an error.", payload);
    }
  } else {
    const code = query.get("code") ?? hash.get("code");

    if (!code) {
      const accessToken = hash.get("access_token");
      if (accessToken) {
        setStatus(
          "Found #access_token in callback URL (implicit flow). Expected ?code=... for PKCE."
        );
      } else {
        setStatus("Missing ?code=... in callback URL.");
      }
    } else {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        const message = error.message ?? "Unknown error";
        if (/code challenge does not match/i.test(message)) {
          setStatus(
            "Failed to exchange code for session (PKCE verifier mismatch). Return to the board and click Reset Auth, then sign in again.",
            { message, debug: debugInfo }
          );
        } else {
          setStatus("Failed to exchange code for session.", { message, debug: debugInfo });
        }
      } else {
        const returnTo = (localStorage.getItem(STORAGE_KEYS.authReturnTo) ?? "").trim();
        if (returnTo) {
          setStatus("Sign-in complete. Redirecting back to the requested page.");
        } else {
          setStatus("Sign-in complete. Redirecting back to the board.");
        }

        if (pkceId && pkceSnapshotKey) {
          // Cleanup PKCE snapshots for this attempt now that we have a session.
          localStorage.removeItem(pkceSnapshotKey);
          localStorage.removeItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.challenge`);
          localStorage.removeItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.method`);

          const latest = localStorage.getItem(`${STORAGE_KEYS.pkcePrefix}latest`);
          if (latest === pkceId) {
            localStorage.removeItem(`${STORAGE_KEYS.pkcePrefix}latest`);
          }
        }

        if (returnTo) {
          localStorage.removeItem(STORAGE_KEYS.authReturnTo);
          window.location.replace(returnTo);
        } else {
          window.location.replace("/");
        }
      }
    }
  }
}
