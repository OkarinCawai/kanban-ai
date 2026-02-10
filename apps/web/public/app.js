const state = {
  boardId: null,
  lists: [],
  cards: [],
  dragCardId: null
};

const dom = {
  apiUrl: document.getElementById("apiUrl"),
  userId: document.getElementById("userId"),
  orgId: document.getElementById("orgId"),
  role: document.getElementById("role"),
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

const log = (message, payload) => {
  const line = payload
    ? `[${new Date().toISOString()}] ${message} ${JSON.stringify(payload)}`
    : `[${new Date().toISOString()}] ${message}`;
  dom.log.textContent = `${line}\n${dom.log.textContent}`.trim();
};

const authHeaders = () => ({
  "Content-Type": "application/json",
  "x-user-id": dom.userId.value.trim(),
  "x-org-id": dom.orgId.value.trim(),
  "x-role": dom.role.value
});

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
      cardNode.querySelector(".card-meta").textContent = `v${card.version} • pos ${card.position}`;
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
