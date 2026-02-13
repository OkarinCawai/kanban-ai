import "../styles.css";

import { captureException, initSentry } from "../lib/sentry";
import {
  STORAGE_KEYS,
  getSupabaseClient,
  getSupabaseCodeVerifierKey,
  normalizeMaybeJsonString
} from "../lib/supabase";

initSentry();

const statusEl = document.getElementById("status");

const setStatus = (message: string, payload?: unknown): void => {
  if (!statusEl) {
    return;
  }
  const line = payload ? `${message}\n${JSON.stringify(payload, null, 2)}` : message;
  statusEl.textContent = line;
};

const supabaseUrl = (localStorage.getItem(STORAGE_KEYS.supabaseUrl) ?? "").trim();
const supabaseKey = (localStorage.getItem(STORAGE_KEYS.supabaseKey) ?? "").trim();

const run = async (): Promise<void> => {
  try {
    if (!supabaseUrl || !supabaseKey) {
      setStatus(
        "Missing Supabase URL / Publishable Key in localStorage. Return to the Signal Room and set them first."
      );
      return;
    }

    const supabase = getSupabaseClient(supabaseUrl, supabaseKey);
    if (!supabase) {
      setStatus("Supabase client could not be created (missing URL/key).");
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    const pkceIdFromUrl =
      query.get("state") ??
      hash.get("state") ??
      query.get("pkce_id") ??
      hash.get("pkce_id");
    const pkceId = pkceIdFromUrl ?? localStorage.getItem(`${STORAGE_KEYS.pkcePrefix}latest`);
    const pkceSnapshotKey = pkceId ? `${STORAGE_KEYS.pkcePrefix}${pkceId}` : null;

    if (pkceId && pkceSnapshotKey) {
      const verifierSnapshotRaw = localStorage.getItem(pkceSnapshotKey);
      const verifierSnapshot = normalizeMaybeJsonString(verifierSnapshotRaw);
      if (verifierSnapshot) {
        const verifierKey = getSupabaseCodeVerifierKey(supabaseUrl);
        if (verifierKey) {
          // auth-js reads `${storageKey}-code-verifier` during exchangeCodeForSession.
          localStorage.setItem(verifierKey, verifierSnapshot);
          sessionStorage.setItem(verifierKey, verifierSnapshot);
        }
      }
    }

    const error =
      query.get("error") ??
      query.get("error_code") ??
      query.get("error_description") ??
      hash.get("error") ??
      hash.get("error_code") ??
      hash.get("error_description");

    if (error) {
      setStatus("Supabase OAuth returned an error.", {
        error: query.get("error") ?? hash.get("error"),
        error_code: query.get("error_code") ?? hash.get("error_code"),
        error_description: query.get("error_description") ?? hash.get("error_description")
      });
      return;
    }

    const code = query.get("code") ?? hash.get("code");
    if (!code) {
      setStatus("Missing ?code=... in callback URL.");
      return;
    }

    const exchange = await supabase.auth.exchangeCodeForSession(code);
    if (exchange.error) {
      captureException(exchange.error, { stage: "supabase.exchangeCodeForSession" });
      const message = exchange.error.message ?? "Unknown error";
      setStatus("Failed to exchange code for session.", { message });
      return;
    }

    setStatus("Sign-in complete. Redirecting back to the Signal Room.");

    if (pkceId && pkceSnapshotKey) {
      localStorage.removeItem(pkceSnapshotKey);
      localStorage.removeItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.challenge`);
      localStorage.removeItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.method`);

      const latest = localStorage.getItem(`${STORAGE_KEYS.pkcePrefix}latest`);
      if (latest === pkceId) {
        localStorage.removeItem(`${STORAGE_KEYS.pkcePrefix}latest`);
      }
    }

    const returnTo = (localStorage.getItem(STORAGE_KEYS.authReturnTo) ?? "").trim();
    if (returnTo) {
      localStorage.removeItem(STORAGE_KEYS.authReturnTo);
      window.location.replace(returnTo);
    } else {
      window.location.replace("/");
    }
  } catch (error) {
    captureException(error, { stage: "auth.callback" });
    const message = error instanceof Error ? error.message : String(error);
    setStatus("Unexpected error in auth callback.", { message });
  }
};

void run();
