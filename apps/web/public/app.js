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
  authUserId: document.getElementById("authUserId"),
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
  supabaseKey: "kanban.supabaseKey"
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
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
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
  try {
    persistSupabaseConfig();
    const supabase = await getSupabaseClient();
    if (!supabase) {
      log("Set Supabase URL + Publishable Key before signing in.");
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: new URL("/auth/callback.html", window.location.origin).toString()
      }
    });
  } catch (error) {
    log("Discord sign-in failed", { message: error.message });
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
