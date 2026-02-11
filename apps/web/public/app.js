const state = {
  boardId: null,
  lists: [],
  cards: [],
  dragCardId: null,
  accessToken: null,
  authUserId: null
};

const dom = {
  apiUrl: document.getElementById("apiUrl"),
  userId: document.getElementById("userId"),
  orgId: document.getElementById("orgId"),
  role: document.getElementById("role"),
  supabaseUrl: document.getElementById("supabaseUrl"),
  supabaseKey: document.getElementById("supabaseKey"),
  loginDiscordBtn: document.getElementById("loginDiscordBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  resetAuthBtn: document.getElementById("resetAuthBtn"),
  authUserId: document.getElementById("authUserId"),
  discordGuildId: document.getElementById("discordGuildId"),
  discordChannelId: document.getElementById("discordChannelId"),
  discordDefaultListId: document.getElementById("discordDefaultListId"),
  upsertDiscordGuildBtn: document.getElementById("upsertDiscordGuildBtn"),
  upsertDiscordChannelMappingBtn: document.getElementById(
    "upsertDiscordChannelMappingBtn"
  ),
  boardTitle: document.getElementById("boardTitle"),
  createBoardBtn: document.getElementById("createBoardBtn"),
  boardId: document.getElementById("boardId"),
  listTitle: document.getElementById("listTitle"),
  createListBtn: document.getElementById("createListBtn"),
  boardColumns: document.getElementById("boardColumns"),
  log: document.getElementById("log"),
  listTemplate: document.getElementById("listTemplate"),
  cardTemplate: document.getElementById("cardTemplate")
};

const STORAGE_KEYS = {
  supabaseUrl: "kanban.supabaseUrl",
  supabaseKey: "kanban.supabaseKey",
  pkcePrefix: "kanban.pkce."
};

const log = (message, payload) => {
  const line = payload
    ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(payload)}`
    : `[${new Date().toISOString()}] ${message}`;
  dom.log.textContent = `${line}\n${dom.log.textContent}`.trim();
};

const authHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
    "x-org-id": dom.orgId.value.trim(),
    "x-role": dom.role.value
  };

  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  } else {
    headers["x-user-id"] = dom.userId.value.trim();
  }

  return headers;
};

const callApi = async (path, method, body) => {
  const response = await fetch(`${dom.apiUrl.value}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message ?? `Request failed: ${response.status}`);
  }

  return json;
};

const sortedCardsForList = (listId) =>
  state.cards
    .filter((card) => card.listId === listId)
    .sort((a, b) => a.position - b.position);

const appendPosition = (cards) => {
  if (!cards.length) {
    return 1024;
  }

  return cards[cards.length - 1].position + 1024;
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

let cachedSupabase = null;
let cachedSupabaseConfig = { url: "", key: "" };

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

  // Clear any saved PKCE snapshots from prior attempts.
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

  // Pin the version so auth flows don't break due to CDN "latest" changes.
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
  dom.authUserId.textContent = "Not signed in";
  dom.userId.disabled = false;

  if (!supabase) {
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    log("Supabase getSession failed", { message: error.message });
    return;
  }

  const session = data?.session;
  if (!session) {
    return;
  }

  state.accessToken = session.access_token;
  state.authUserId = session.user.id;
  dom.authUserId.textContent = session.user.id;
  dom.userId.value = session.user.id;
  dom.userId.disabled = true;
};

const render = () => {
  dom.boardId.textContent = state.boardId ?? "Not created";
  dom.boardColumns.innerHTML = "";

  for (const list of state.lists) {
    const listNode = dom.listTemplate.content.firstElementChild.cloneNode(true);
    listNode.querySelector(".list-title").textContent = list.title;

    const cardsEl = listNode.querySelector(".cards");
    cardsEl.dataset.listId = list.id;

    cardsEl.addEventListener("dragover", (event) => {
      event.preventDefault();
      cardsEl.classList.add("drag-target");
    });

    cardsEl.addEventListener("dragleave", () => {
      cardsEl.classList.remove("drag-target");
    });

    cardsEl.addEventListener("drop", async (event) => {
      event.preventDefault();
      cardsEl.classList.remove("drag-target");
      if (!state.dragCardId) {
        return;
      }

      const card = state.cards.find((item) => item.id === state.dragCardId);
      if (!card) {
        return;
      }

      const destination = sortedCardsForList(list.id).filter(
        (item) => item.id !== card.id
      );
      const nextPosition = appendPosition(destination);

      try {
        const moved = await callApi(`/cards/${card.id}/move`, "PATCH", {
          toListId: list.id,
          position: nextPosition,
          expectedVersion: card.version
        });

        state.cards = state.cards.map((item) =>
          item.id === moved.id ? moved : item
        );
        log("Moved card", { cardId: moved.id, toListId: list.id });
        render();
      } catch (error) {
        log("Move failed", { message: error.message });
      } finally {
        state.dragCardId = null;
      }
    });

    const cardTitleInput = listNode.querySelector(".card-title-input");
    listNode.querySelector(".add-card-btn").addEventListener("click", async () => {
      if (!state.boardId) {
        log("Create a board before adding cards.");
        return;
      }

      const title = cardTitleInput.value.trim();
      if (!title) {
        log("Card title is required.");
        return;
      }

      try {
        const card = await callApi("/cards", "POST", {
          listId: list.id,
          title,
          position: appendPosition(sortedCardsForList(list.id))
        });
        state.cards.push(card);
        cardTitleInput.value = "";
        log("Created card", { cardId: card.id, listId: list.id });
        render();
      } catch (error) {
        log("Card create failed", { message: error.message });
      }
    });

    for (const card of sortedCardsForList(list.id)) {
      const cardNode = dom.cardTemplate.content.firstElementChild.cloneNode(true);
      cardNode.dataset.cardId = card.id;
      cardNode.querySelector(".card-title").textContent = card.title;
      cardNode.querySelector(".card-meta").textContent = `v${card.version} * pos ${card.position}`;
      cardNode.addEventListener("dragstart", () => {
        state.dragCardId = card.id;
      });
      cardsEl.appendChild(cardNode);
    }

    dom.boardColumns.appendChild(listNode);
  }
};

dom.createBoardBtn.addEventListener("click", async () => {
  const title = dom.boardTitle.value.trim();
  if (!title) {
    log("Board title is required.");
    return;
  }

  try {
    const board = await callApi("/boards", "POST", { title });
    state.boardId = board.id;
    state.lists = [];
    state.cards = [];
    log("Created board", { boardId: board.id });
    render();
  } catch (error) {
    log("Board create failed", { message: error.message });
  }
});

dom.createListBtn.addEventListener("click", async () => {
  if (!state.boardId) {
    log("Create a board before adding lists.");
    return;
  }

  const title = dom.listTitle.value.trim();
  if (!title) {
    log("List title is required.");
    return;
  }

  try {
    const list = await callApi("/lists", "POST", {
      boardId: state.boardId,
      title,
      position: state.lists.length * 1024
    });
    state.lists.push(list);
    log("Created list", { listId: list.id });
    render();
  } catch (error) {
    log("List create failed", { message: error.message });
  }
});

render();

hydrateSupabaseConfig();
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
    persistSupabaseConfig();
    const supabase = await getSupabaseClient();
    if (!supabase) {
      log("Set Supabase URL + Publishable Key before signing in.");
      return;
    }

    // Avoid PKCE verifier mismatch from parallel/duplicate auth attempts by:
    // 1) creating a unique callback marker (pkce_id),
    // 2) capturing the generated code_verifier under that marker,
    // 3) restoring it on the callback page before exchanging the code.
    const pkceId = crypto.randomUUID();
    const redirectUrl = new URL(`/auth/callback.html`, window.location.origin);
    // Supabase drops existing query params when appending ?code=..., but it typically preserves hash.
    // Put our PKCE attempt id in the hash so the callback can reliably restore the matching verifier.
    redirectUrl.hash = `pkce_id=${encodeURIComponent(pkceId)}`;
    const redirectTo = redirectUrl.toString();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo,
        // Avoid browser auto-redirect so we can snapshot the PKCE code_verifier first.
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

    if (verifier && verifierRaw && verifier !== verifierRaw) {
      log("Normalized PKCE verifier from JSON storage format.", {
        rawPrefix: verifierRaw.slice(0, 12),
        normalizedPrefix: verifier.slice(0, 12)
      });
    }

    if (verifier) {
      localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}`, verifier);
      localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}latest`, pkceId);
    } else {
      log("PKCE verifier not found in storage; exchange may fail.", { verifierKey });
    }

    if (!data?.url) {
      throw new Error("Supabase did not return an OAuth URL.");
    }

    try {
      const oauthUrl = new URL(data.url);
      const challengeInUrl = oauthUrl.searchParams.get("code_challenge");
      const methodInUrl = oauthUrl.searchParams.get("code_challenge_method");

      if (challengeInUrl) {
        localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.challenge`, challengeInUrl);
      }
      if (methodInUrl) {
        localStorage.setItem(`${STORAGE_KEYS.pkcePrefix}${pkceId}.method`, methodInUrl);
      }
    } catch {
      // Ignore: this is only used for debugging PKCE issues.
    }

    if (verifier) {
      try {
        const computePkceChallenge = async (rawVerifier) => {
          const hasCryptoSupport =
            typeof crypto !== "undefined" &&
            typeof crypto.subtle !== "undefined" &&
            typeof TextEncoder !== "undefined";

          if (!hasCryptoSupport) {
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

        const oauthUrl = new URL(data.url);
        const challengeInUrl = oauthUrl.searchParams.get("code_challenge") ?? "";
        const methodInUrl = oauthUrl.searchParams.get("code_challenge_method") ?? "";
        const expectedChallenge =
          methodInUrl === "plain" ? verifier : await computePkceChallenge(verifier);

        if (challengeInUrl && expectedChallenge !== challengeInUrl) {
          log("PKCE mismatch before redirect; auth may fail.", {
            pkceId,
            method: methodInUrl,
            expectedPrefix: expectedChallenge.slice(0, 12),
            gotPrefix: challengeInUrl.slice(0, 12)
          });
        }
      } catch (err) {
        log("PKCE debug failed", { message: err?.message ?? String(err) });
      }
    }

    window.location.assign(data.url);
  } catch (error) {
    log("Discord sign-in failed", { message: error.message });
  } finally {
    // If we successfully redirected, the page unloads and this doesn't matter.
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

dom.upsertDiscordGuildBtn.addEventListener("click", async () => {
  const guildId = dom.discordGuildId.value.trim();
  if (!guildId) {
    log("Discord Guild ID is required.");
    return;
  }

  try {
    await callApi("/discord/guilds", "POST", { guildId });
    log("Upserted discord guild mapping.", { guildId, orgId: dom.orgId.value.trim() });
  } catch (error) {
    log("Discord guild mapping failed", { message: error.message });
  }
});

dom.upsertDiscordChannelMappingBtn.addEventListener("click", async () => {
  const guildId = dom.discordGuildId.value.trim();
  const channelId = dom.discordChannelId.value.trim();
  const defaultListId = dom.discordDefaultListId.value.trim();

  if (!guildId) {
    log("Discord Guild ID is required.");
    return;
  }
  if (!channelId) {
    log("Discord Channel ID is required.");
    return;
  }
  if (!state.boardId) {
    log("Create a board first so we have a board_id to map this channel to.");
    return;
  }
  if (defaultListId && !state.lists.some((list) => list.id === defaultListId)) {
    log("Default List ID must be a valid list UUID from the current board.", {
      boardId: state.boardId
    });
    return;
  }

  try {
    await callApi("/discord/channel-mappings", "POST", {
      guildId,
      channelId,
      boardId: state.boardId,
      defaultListId: defaultListId || null
    });
    log("Upserted discord channel mapping.", {
      guildId,
      channelId,
      boardId: state.boardId,
      defaultListId: defaultListId || null
    });
  } catch (error) {
    log("Discord channel mapping failed", { message: error.message });
  }
});
