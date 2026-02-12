import { state, appendHistory, recordFeatureError, recordRequestEvent, recordPollEvent, HISTORY_LIMIT } from "/src/state/store.js";
import { config, updateConfig } from "/src/api/config.js";
import { callApi } from "/src/api/client.js";
import { nowIso, formatTimestamp, formatElapsed, toDateTimeLocalValue, fromDateTimeLocalValue, parseCsv } from "/src/utils/formatting.js";
import { sortedCardsForList, appendPosition, moveCardToList } from "/src/features/board/logic.js";
import { pollCardSummary, pollAskBoardResult, STATUS_TERMINAL, STATUS_ACTIVE, toUiStatus } from "/src/features/ai/polling.js";
import { persistSupabaseConfig as _persistSupabaseConfig, hydrateSupabaseConfig as _hydrateSupabaseConfig, clearSupabaseAuthStorage, getSupabaseClient as _getSupabaseClient } from "/src/api/auth.js";

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
  askBoardQuestion: document.getElementById("askBoardQuestion"),
  askBoardTopK: document.getElementById("askBoardTopK"),
  askBoardBtn: document.getElementById("askBoardBtn"),
  askBoardStatus: document.getElementById("askBoardStatus"),
  askBoardAnswer: document.getElementById("askBoardAnswer"),
  askBoardReferences: document.getElementById("askBoardReferences"),
  askBoardLastUpdated: document.getElementById("askBoardLastUpdated"),
  copyEvalBundleBtn: document.getElementById("copyEvalBundleBtn"),
  askJobTimeline: document.getElementById("askJobTimeline"),
  diagnosticsSummary: document.getElementById("diagnosticsSummary"),
  pollDiagnostics: document.getElementById("pollDiagnostics"),
  toggleSettingsBtn: document.getElementById("toggleSettingsBtn"),
  settingsShell: document.getElementById("settingsShell"),
  toggleDiagnosticsBtn: document.getElementById("toggleDiagnosticsBtn"),
  diagnosticsShell: document.getElementById("diagnosticsShell"),
  cardDetailForm: document.getElementById("cardDetailForm"),
  detailCardId: document.getElementById("detailCardId"),
  detailCardHint: document.getElementById("detailCardHint"),
  detailTitle: document.getElementById("detailTitle"),
  detailDescription: document.getElementById("detailDescription"),
  detailAssignees: document.getElementById("detailAssignees"),
  detailStartAt: document.getElementById("detailStartAt"),
  detailDueAt: document.getElementById("detailDueAt"),
  detailLocationText: document.getElementById("detailLocationText"),
  detailLocationUrl: document.getElementById("detailLocationUrl"),
  detailLabels: document.getElementById("detailLabels"),
  detailChecklist: document.getElementById("detailChecklist"),
  detailCommentCount: document.getElementById("detailCommentCount"),
  detailAttachmentCount: document.getElementById("detailAttachmentCount"),
  saveCardDetailsBtn: document.getElementById("saveCardDetailsBtn"),
  clearCardSelectionBtn: document.getElementById("clearCardSelectionBtn"),
  srAnnouncer: document.getElementById("srAnnouncer"),
  log: document.getElementById("log"),
  listTemplate: document.getElementById("listTemplate"),
  cardTemplate: document.getElementById("cardTemplate")
};

// Sync Config
const syncConfig = () => {
  updateConfig({
    apiUrl: dom.apiUrl.value.trim(),
    userId: dom.userId.value.trim(),
    orgId: dom.orgId.value.trim(),
    role: dom.role.value
  });
};
syncConfig();
[dom.apiUrl, dom.userId, dom.orgId, dom.role].forEach(el => {
  el?.addEventListener("input", syncConfig);
  el?.addEventListener("change", syncConfig);
});



const LABEL_COLORS = new Set([
  "gray",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "teal"
]);



const parseLabelsText = (value) => {
  if (!value.trim()) {
    return [];
  }

  const labels = [];
  for (const token of parseCsv(value)) {
    const [namePart, colorPart] = token.split(":");
    const name = namePart?.trim();
    const color = colorPart?.trim().toLowerCase();

    if (!name || !color || !LABEL_COLORS.has(color)) {
      throw new Error(
        `Invalid label "${token}". Use name:color where color is ${Array.from(LABEL_COLORS).join(", ")}.`
      );
    }

    labels.push({ name, color });
  }

  return labels;
};

const parseChecklistText = (value, existingChecklist = []) => {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const existingByTitle = new Map(
    existingChecklist.map((item) => [item.title.trim().toLowerCase(), item])
  );

  return lines.map((line, index) => {
    const done = /^\[(x|X)\]\s*/.test(line);
    const title = line.replace(/^\[(x|X|\s)\]\s*/, "").trim();
    const prior = existingByTitle.get(title.toLowerCase());
    return {
      id: prior?.id,
      title,
      isDone: done,
      position: index * 1024
    };
  });
};

const calcChecklistProgress = (card) => {
  const checklist = card.checklist ?? [];
  const total = checklist.length;
  const done = checklist.filter((item) => item.isDone).length;
  return { total, done };
};

const getDueBadge = (card) => {
  if (!card.dueAt) {
    return null;
  }

  const due = new Date(card.dueAt);
  if (Number.isNaN(due.valueOf())) {
    return null;
  }

  const diffMs = due.valueOf() - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.ceil(diffMs / dayMs);
  if (days < 0) {
    return { text: `overdue ${Math.abs(days)}d`, className: "badge-due-overdue" };
  }
  if (days <= 2) {
    return { text: `due ${Math.max(days, 0)}d`, className: "badge-due-soon" };
  }
  return { text: `due ${days}d`, className: "badge-due-ok" };
};

const getSelectedCard = () =>
  state.selectedCardId ? state.cards.find((card) => card.id === state.selectedCardId) ?? null : null;

const isEditingDetailForm = () =>
  Boolean(
    dom.cardDetailForm &&
    document.activeElement instanceof HTMLElement &&
    dom.cardDetailForm.contains(document.activeElement)
  );

const setCardDetailFormEnabled = (enabled) => {
  if (!dom.cardDetailForm) {
    return;
  }
  dom.cardDetailForm.classList.toggle("is-disabled", !enabled);
  for (const field of Array.from(dom.cardDetailForm.elements)) {
    if (!(field instanceof HTMLElement)) {
      continue;
    }
    if (field.id === "clearCardSelectionBtn") {
      field.disabled = false;
      continue;
    }
    field.disabled = !enabled;
  }
};

const fillCardDetailForm = (card) => {
  if (!card) {
    dom.detailCardId.textContent = "none";
    dom.detailCardHint.textContent =
      "Select a card from the board to edit description, assignees, dates, location, labels, and checklist.";
    dom.detailTitle.value = "";
    dom.detailDescription.value = "";
    dom.detailAssignees.value = "";
    dom.detailStartAt.value = "";
    dom.detailDueAt.value = "";
    dom.detailLocationText.value = "";
    dom.detailLocationUrl.value = "";
    dom.detailLabels.value = "";
    dom.detailChecklist.value = "";
    dom.detailCommentCount.value = "0";
    dom.detailAttachmentCount.value = "0";
    setCardDetailFormEnabled(false);
    return;
  }

  dom.detailCardId.textContent = card.id;
  dom.detailCardHint.textContent = `Editing ${card.title}`;
  dom.detailTitle.value = card.title ?? "";
  dom.detailDescription.value = card.description ?? "";
  dom.detailAssignees.value = (card.assigneeUserIds ?? []).join(", ");
  dom.detailStartAt.value = toDateTimeLocalValue(card.startAt);
  dom.detailDueAt.value = toDateTimeLocalValue(card.dueAt);
  dom.detailLocationText.value = card.locationText ?? "";
  dom.detailLocationUrl.value = card.locationUrl ?? "";
  dom.detailLabels.value = (card.labels ?? [])
    .map((label) => `${label.name}:${label.color}`)
    .join(", ");
  dom.detailChecklist.value = [...(card.checklist ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => `${item.isDone ? "[x]" : "[ ]"} ${item.title}`)
    .join("\n");
  dom.detailCommentCount.value = String(card.commentCount ?? 0);
  dom.detailAttachmentCount.value = String(card.attachmentCount ?? 0);
  setCardDetailFormEnabled(true);
};

const appendMetaBadge = (container, text, className) => {
  const badge = document.createElement("span");
  badge.className = `meta-badge ${className}`.trim();
  badge.textContent = text;
  container.appendChild(badge);
};

const renderCardBadges = (card, badgesEl) => {
  badgesEl.innerHTML = "";

  const dueBadge = getDueBadge(card);
  if (dueBadge) {
    appendMetaBadge(badgesEl, dueBadge.text, dueBadge.className);
  }

  const checklist = calcChecklistProgress(card);
  if (checklist.total > 0) {
    appendMetaBadge(
      badgesEl,
      `check ${checklist.done}/${checklist.total}`,
      "badge-checklist"
    );
  }

  const assigneeCount = (card.assigneeUserIds ?? []).length;
  if (assigneeCount > 0) {
    appendMetaBadge(badgesEl, `assignees ${assigneeCount}`, "badge-assignees");
  }

  const commentCount = card.commentCount ?? 0;
  if (commentCount > 0) {
    appendMetaBadge(badgesEl, `comments ${commentCount}`, "badge-count");
  }

  const attachmentCount = card.attachmentCount ?? 0;
  if (attachmentCount > 0) {
    appendMetaBadge(badgesEl, `files ${attachmentCount}`, "badge-count");
  }

  for (const label of card.labels ?? []) {
    appendMetaBadge(
      badgesEl,
      label.name,
      `badge-label badge-label-${String(label.color ?? "gray").toLowerCase()}`
    );
  }
};

const buildCardPatchFromForm = (card) => {
  const title = dom.detailTitle.value.trim();
  if (!title) {
    throw new Error("Title is required.");
  }

  const startAt = fromDateTimeLocalValue(dom.detailStartAt.value);
  const dueAt = fromDateTimeLocalValue(dom.detailDueAt.value);
  if (startAt && dueAt && new Date(dueAt).valueOf() < new Date(startAt).valueOf()) {
    throw new Error("Due date must be equal or later than start date.");
  }

  const commentCount = Number.parseInt(dom.detailCommentCount.value, 10);
  const attachmentCount = Number.parseInt(dom.detailAttachmentCount.value, 10);
  if (!Number.isInteger(commentCount) || commentCount < 0) {
    throw new Error("Comment count must be a non-negative integer.");
  }
  if (!Number.isInteger(attachmentCount) || attachmentCount < 0) {
    throw new Error("Attachment count must be a non-negative integer.");
  }

  const description = dom.detailDescription.value.trim();
  const locationText = dom.detailLocationText.value.trim();
  const locationUrl = dom.detailLocationUrl.value.trim();

  return {
    expectedVersion: card.version,
    title,
    description: description ? description : null,
    startAt,
    dueAt,
    locationText: locationText ? locationText : null,
    locationUrl: locationUrl ? locationUrl : null,
    assigneeUserIds: parseCsv(dom.detailAssignees.value),
    labels: parseLabelsText(dom.detailLabels.value),
    checklist: parseChecklistText(dom.detailChecklist.value, card.checklist ?? []),
    commentCount,
    attachmentCount
  };
};

// toUiStatus imported. applyStatusChip kept.
const applyStatusChip = (element, status, labelPrefix = "") => {
  if (!element) {
    return;
  }

  const normalized = toUiStatus(status);
  element.classList.remove(
    "status-idle",
    "status-queued",
    "status-processing",
    "status-completed",
    "status-failed"
  );
  element.classList.add(`status-${normalized}`);
  element.textContent = labelPrefix ? `${labelPrefix} ${normalized}` : normalized;
};

const log = (message, payload) => {
  const line = payload
    ? `[${nowIso()}] ${message} ${JSON.stringify(payload)}`
    : `[${nowIso()}] ${message}`;
  dom.log.textContent = `${line}\n${dom.log.textContent}`.trim();
};

const announce = (message) => {
  if (!dom.srAnnouncer) {
    return;
  }

  // Clear first so repeated messages are still announced by assistive tech.
  dom.srAnnouncer.textContent = "";
  window.setTimeout(() => {
    dom.srAnnouncer.textContent = message;
  }, 20);
};

const syncToggleExpanded = (button, isExpanded) => {
  if (!button) {
    return;
  }
  button.setAttribute("aria-expanded", isExpanded ? "true" : "false");
};



const persistSupabaseConfig = () => {
  _persistSupabaseConfig(dom.supabaseUrl.value.trim(), dom.supabaseKey.value.trim());
};

const hydrateSupabaseConfig = () => {
  const { url, key } = _hydrateSupabaseConfig();
  if (url && !dom.supabaseUrl.value.trim()) dom.supabaseUrl.value = url;
  if (key && !dom.supabaseKey.value.trim()) dom.supabaseKey.value = key;
};

const getSupabaseClient = () => _getSupabaseClient(dom.supabaseUrl.value.trim(), dom.supabaseKey.value.trim());

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
    recordFeatureError("auth-session", error.message);
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

const getActiveAskJob = () => {
  if (!state.askJobs.length) {
    return null;
  }
  const active = state.askJobs.find((job) => job.jobId === state.activeAskJobId);
  return active ?? state.askJobs[0];
};

const upsertAskJob = (job) => {
  const index = state.askJobs.findIndex((item) => item.jobId === job.jobId);
  if (index === -1) {
    state.askJobs.unshift(job);
    if (state.askJobs.length > HISTORY_LIMIT) {
      state.askJobs.length = HISTORY_LIMIT;
    }
    return;
  }
  state.askJobs[index] = { ...state.askJobs[index], ...job };
};

const renameAskJob = (fromJobId, toJobId) => {
  if (!fromJobId || !toJobId || fromJobId === toJobId) {
    return;
  }

  const index = state.askJobs.findIndex((job) => job.jobId === fromJobId);
  if (index === -1) {
    return;
  }

  state.askJobs[index] = {
    ...state.askJobs[index],
    jobId: toJobId
  };
  if (state.activeAskJobId === fromJobId) {
    state.activeAskJobId = toJobId;
  }
};

const formatCardSummaryPayload = (summary) => {
  if (!summary) {
    return "";
  }

  const lines = [];
  if (summary.summary) {
    lines.push(summary.summary);
  }
  if (Array.isArray(summary.highlights) && summary.highlights.length) {
    lines.push("");
    lines.push("Highlights:");
    lines.push(...summary.highlights.map((item) => `- ${item}`));
  }
  if (Array.isArray(summary.risks) && summary.risks.length) {
    lines.push("");
    lines.push("Risks:");
    lines.push(...summary.risks.map((item) => `- ${item}`));
  }
  if (Array.isArray(summary.actionItems) && summary.actionItems.length) {
    lines.push("");
    lines.push("Action Items:");
    lines.push(...summary.actionItems.map((item) => `- ${item}`));
  }

  return lines.join("\n").trim();
};

const buildEvalBundleText = (job) => {
  const references = (job?.references ?? [])
    .map(
      (reference, index) =>
        `${index + 1}. [${reference.sourceType ?? "unknown"}] ${reference.excerpt ?? ""}`
    )
    .join("\n");

  return [
    `question: ${job?.question ?? ""}`,
    `status: ${job?.status ?? "idle"}`,
    `job_id: ${job?.jobId ?? "n/a"}`,
    `updated_at: ${job?.updatedAt ?? ""}`,
    "",
    "answer:",
    job?.answer ?? "",
    "",
    "references:",
    references || "(none)"
  ].join("\n");
};

const renderReferences = (references) => {
  dom.askBoardReferences.innerHTML = "";
  if (!Array.isArray(references) || references.length === 0) {
    const empty = document.createElement("li");
    empty.className = "reference-item";
    empty.textContent = "No references yet.";
    dom.askBoardReferences.appendChild(empty);
    return;
  }

  for (const reference of references.slice(0, 8)) {
    const item = document.createElement("li");
    item.className = "reference-item";

    const head = document.createElement("div");
    head.className = "reference-head";

    const source = document.createElement("strong");
    source.textContent = reference.sourceType ?? "unknown";

    const chunk = document.createElement("span");
    chunk.className = "status-chip status-idle";
    chunk.textContent = `chunk ${reference.chunkId ?? "n/a"}`;
    head.append(source, chunk);

    const excerpt = document.createElement("p");
    excerpt.className = "reference-excerpt";
    excerpt.textContent = reference.excerpt ?? "";

    item.append(head, excerpt);
    dom.askBoardReferences.appendChild(item);
  }
};

const renderAskTimeline = () => {
  dom.askJobTimeline.innerHTML = "";
  if (!state.askJobs.length) {
    const empty = document.createElement("li");
    empty.className = "job-item";
    empty.textContent = "No ask-board jobs yet.";
    dom.askJobTimeline.appendChild(empty);
    return;
  }

  for (const job of state.askJobs.slice(0, HISTORY_LIMIT)) {
    const item = document.createElement("li");
    item.className = "job-item";

    const head = document.createElement("div");
    head.className = "job-head";

    const label = document.createElement("strong");
    label.textContent = job.jobId;
    const chip = document.createElement("span");
    chip.className = "status-chip";
    applyStatusChip(chip, job.status);
    head.append(label, chip);

    const text = document.createElement("p");
    text.className = "job-text";
    text.textContent = [
      `Q: ${job.question}`,
      `updated: ${formatTimestamp(job.updatedAt)}`,
      `elapsed: ${formatElapsed(job.createdAt, job.updatedAt)}`
    ].join(" | ");

    item.append(head, text);
    dom.askJobTimeline.appendChild(item);
  }
};

const renderAskResult = () => {
  const activeJob = getActiveAskJob();
  const status = activeJob?.status ?? state.askBoardStatus;

  applyStatusChip(dom.askBoardStatus, status);
  dom.askBoardLastUpdated.textContent = activeJob
    ? formatTimestamp(activeJob.updatedAt)
    : "not started";

  if (!activeJob) {
    dom.askBoardAnswer.textContent =
      "Ask a question to start an async retrieval + grounding job.";
    renderReferences([]);
    dom.copyEvalBundleBtn.disabled = true;
    return;
  }

  if (status === "completed") {
    dom.askBoardAnswer.textContent = activeJob.answer || "(completed with empty answer)";
  } else if (status === "failed") {
    dom.askBoardAnswer.textContent =
      activeJob.errorMessage || "Ask-board failed. Retry the question.";
  } else if (STATUS_ACTIVE.has(status)) {
    dom.askBoardAnswer.textContent = `Job ${activeJob.jobId} is ${status}...`;
  } else {
    dom.askBoardAnswer.textContent = "Awaiting job execution.";
  }

  renderReferences(activeJob.references ?? []);
  dom.copyEvalBundleBtn.disabled = status !== "completed";
};

const renderDiagnostics = () => {
  const summaryLines = [
    `total requests: ${state.diagnostics.requestCount}`,
    `visible request events: ${state.diagnostics.requestEvents.length}`,
    ""
  ];

  if (state.diagnostics.requestEvents.length) {
    summaryLines.push("recent requests:");
    summaryLines.push(
      ...state.diagnostics.requestEvents.slice(0, 8).map((event) => {
        const statusText =
          typeof event.status === "number" ? `HTTP ${event.status}` : String(event.status);
        return `- ${event.localRequestId} ${event.method} ${event.path} (${event.feature}) => ${statusText} in ${event.durationMs}ms`;
      })
    );
    summaryLines.push("");
  }

  const errorEntries = Object.entries(state.diagnostics.lastErrorByFeature);
  if (errorEntries.length) {
    summaryLines.push("last errors:");
    summaryLines.push(
      ...errorEntries.map(
        ([feature, details]) =>
          `- ${feature}: ${details.message} @ ${formatTimestamp(details.at)}`
      )
    );
  } else {
    summaryLines.push("last errors: none");
  }

  dom.diagnosticsSummary.textContent = summaryLines.join("\n");

  if (!state.diagnostics.pollEvents.length) {
    dom.pollDiagnostics.textContent = "No poll events yet.";
    return;
  }

  dom.pollDiagnostics.textContent = state.diagnostics.pollEvents
    .slice(0, 24)
    .map(
      (event) =>
        `${event.at} | ${event.feature} | ${event.targetId} | attempt ${event.attempt} -> ${event.status}`
    )
    .join("\n");
};

const render = () => {
  if (state.selectedCardId && !state.cards.some((card) => card.id === state.selectedCardId)) {
    state.selectedCardId = null;
  }

  dom.boardId.textContent = state.boardId ?? "Not created";
  dom.boardColumns.innerHTML = "";
  renderAskResult();
  renderAskTimeline();
  renderDiagnostics();
  if (!isEditingDetailForm()) {
    fillCardDetailForm(getSelectedCard());
  }

  for (const [listIndex, list] of state.lists.entries()) {
    const listNode = dom.listTemplate.content.firstElementChild.cloneNode(true);
    const listTitleEl = listNode.querySelector(".list-title");
    listTitleEl.textContent = list.title;
    listTitleEl.id = `list-title-${list.id}`;
    listNode.setAttribute("role", "group");
    listNode.setAttribute("aria-labelledby", listTitleEl.id);

    const cardsEl = listNode.querySelector(".cards");
    cardsEl.dataset.listId = list.id;
    cardsEl.setAttribute("role", "list");
    cardsEl.setAttribute("aria-label", `${list.title} cards`);

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

      try {
        const moved = await moveCardToList(card, list.id);
        log("Moved card", { cardId: moved.id, toListId: list.id });
        announce(`Moved ${moved.title} to list ${list.title}.`);
      } catch (error) {
        log("Move failed", { message: error.message });
      } finally {
        state.dragCardId = null;
        render();
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
        const card = await callApi(
          "/cards",
          "POST",
          {
            listId: list.id,
            title,
            position: appendPosition(sortedCardsForList(list.id))
          },
          "card-create"
        );
        state.cards.push(card);
        cardTitleInput.value = "";
        log("Created card", { cardId: card.id, listId: list.id });
        announce(`Created card ${title} in list ${list.title}.`);
        render();
      } catch (error) {
        log("Card create failed", { message: error.message });
      }
    });

    for (const card of sortedCardsForList(list.id)) {
      const cardNode = dom.cardTemplate.content.firstElementChild.cloneNode(true);
      cardNode.dataset.cardId = card.id;
      cardNode.setAttribute("role", "listitem");
      cardNode.setAttribute("tabindex", "0");
      cardNode.setAttribute("aria-label", `Card ${card.title}`);
      cardNode.classList.toggle("card-selected", card.id === state.selectedCardId);

      cardNode.querySelector(".card-title").textContent = card.title;
      cardNode.querySelector(".card-meta").textContent = `v${card.version} * pos ${Math.round(card.position)}`;
      renderCardBadges(card, cardNode.querySelector(".card-badges"));

      const movedAt = state.movedCardAtByCardId[card.id];
      if (movedAt && Date.now() - movedAt < 2200) {
        cardNode.classList.add("card-flash");
      }

      const summaryText = state.cardSummaries[card.id];
      const summaryStatus = state.cardSummaryStatusByCardId[card.id] ?? "idle";
      const summaryUpdatedAt = state.cardSummaryUpdatedAtByCardId[card.id];

      const summaryEl = cardNode.querySelector(".card-summary");
      if (summaryText) {
        summaryEl.textContent = summaryText;
      } else if (STATUS_ACTIVE.has(summaryStatus)) {
        summaryEl.textContent = "Summary job is running...";
      } else if (summaryStatus === "failed") {
        summaryEl.textContent = "Summary failed. Retry.";
      } else {
        summaryEl.textContent = "No AI summary yet.";
      }

      const updatedAtEl = cardNode.querySelector(".card-summary-updated-at");
      updatedAtEl.textContent = summaryUpdatedAt
        ? `updated ${formatTimestamp(summaryUpdatedAt)}`
        : "no summary yet";

      const summaryStatusEl = cardNode.querySelector(".card-summary-status");
      applyStatusChip(summaryStatusEl, summaryStatus, "summary");

      const summarizeButton = cardNode.querySelector(".summarize-card-btn");
      const movePrevButton = cardNode.querySelector(".move-prev-btn");
      const moveNextButton = cardNode.querySelector(".move-next-btn");
      const editButton = cardNode.querySelector(".edit-card-btn");

      movePrevButton.disabled = listIndex === 0;
      moveNextButton.disabled = listIndex >= state.lists.length - 1;
      movePrevButton.setAttribute("aria-label", `Move ${card.title} to previous list`);
      moveNextButton.setAttribute("aria-label", `Move ${card.title} to next list`);
      summarizeButton.setAttribute("aria-label", `Summarize card ${card.title}`);
      editButton.setAttribute("aria-label", `Edit details for card ${card.title}`);

      const selectCard = () => {
        state.selectedCardId = card.id;
        announce(`Selected card ${card.title} for detail editing.`);
        render();
      };

      const runSummary = async () => {
        state.cardSummaryStatusByCardId[card.id] = "queued";
        announce(`Summary queued for ${card.title}.`);
        render();

        try {
          const queued = await callApi(
            `/cards/${card.id}/summarize`,
            "POST",
            {},
            "card-summary-enqueue"
          );
          log("Queued card summary", { cardId: card.id, jobId: queued.jobId });

          const status = await pollCardSummary(card.id, 10, 1500, (nextStatus) => {
            state.cardSummaryStatusByCardId[card.id] = toUiStatus(nextStatus);
            render();
          });

          if (status?.status === "completed" && status.summary) {
            state.cardSummaries[card.id] = formatCardSummaryPayload(status.summary);
            state.cardSummaryStatusByCardId[card.id] = "completed";
            state.cardSummaryUpdatedAtByCardId[card.id] = nowIso();
            log("Card summary completed", { cardId: card.id });
            announce(`Summary completed for ${card.title}.`);
            render();
            return;
          }

          if (status?.status === "failed") {
            state.cardSummaryStatusByCardId[card.id] = "failed";
            state.cardSummaryUpdatedAtByCardId[card.id] = nowIso();
            announce(`Summary failed for ${card.title}.`);
          }
          log("Card summary still pending", {
            cardId: card.id,
            status: status?.status ?? "queued"
          });
        } catch (error) {
          state.cardSummaryStatusByCardId[card.id] = "failed";
          state.cardSummaryUpdatedAtByCardId[card.id] = nowIso();
          log("Card summarize failed", { cardId: card.id, message: error.message });
          announce(`Summary failed for ${card.title}.`);
        } finally {
          render();
        }
      };

      const moveByOffset = async (offset) => {
        const targetIndex = listIndex + offset;
        if (targetIndex < 0 || targetIndex >= state.lists.length) {
          return;
        }

        const targetList = state.lists[targetIndex];
        try {
          const moved = await moveCardToList(card, targetList.id);
          log("Moved card", { cardId: moved.id, toListId: targetList.id });
          announce(`Moved ${moved.title} to list ${targetList.title}.`);
          render();
        } catch (error) {
          log("Move failed", { message: error.message });
        }
      };

      summarizeButton.addEventListener("click", () => {
        void runSummary();
      });
      editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        selectCard();
      });
      movePrevButton.addEventListener("click", () => {
        void moveByOffset(-1);
      });
      moveNextButton.addEventListener("click", () => {
        void moveByOffset(1);
      });

      cardNode.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) {
          return;
        }
        selectCard();
      });

      cardNode.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        if (event.target !== cardNode) {
          return;
        }

        if (event.key === "s" || event.key === "S") {
          event.preventDefault();
          void runSummary();
          return;
        }

        if (event.key === "e" || event.key === "E") {
          event.preventDefault();
          selectCard();
          return;
        }

        if (event.key === "[" || event.key === "ArrowLeft") {
          event.preventDefault();
          if (!movePrevButton.disabled) {
            void moveByOffset(-1);
          }
          return;
        }

        if (event.key === "]" || event.key === "ArrowRight") {
          event.preventDefault();
          if (!moveNextButton.disabled) {
            void moveByOffset(1);
          }
        }
      });

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
    const board = await callApi("/boards", "POST", { title }, "board-create");
    state.boardId = board.id;
    state.lists = [];
    state.cards = [];
    state.cardSummaries = {};
    state.cardSummaryStatusByCardId = {};
    state.cardSummaryUpdatedAtByCardId = {};
    state.askJobs = [];
    state.activeAskJobId = null;
    state.askBoardStatus = "idle";
    state.selectedCardId = null;
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
    const list = await callApi(
      "/lists",
      "POST",
      {
        boardId: state.boardId,
        title,
        position: state.lists.length * 1024
      },
      "list-create"
    );
    state.lists.push(list);
    log("Created list", { listId: list.id });
    render();
  } catch (error) {
    log("List create failed", { message: error.message });
  }
});

if (dom.cardDetailForm) {
  dom.cardDetailForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const card = getSelectedCard();
    if (!card) {
      log("Select a card before saving details.");
      return;
    }

    try {
      const patch = buildCardPatchFromForm(card);
      const updated = await callApi(
        `/cards/${card.id}`,
        "PATCH",
        patch,
        "card-update-details"
      );
      state.cards = state.cards.map((item) => (item.id === updated.id ? updated : item));
      state.selectedCardId = updated.id;
      fillCardDetailForm(updated);
      log("Updated card details", { cardId: updated.id, version: updated.version });
      announce(`Saved details for ${updated.title}.`);
      render();
    } catch (error) {
      log("Card detail save failed", { message: error.message });
      announce("Card detail save failed.");
    }
  });
}

if (dom.clearCardSelectionBtn) {
  dom.clearCardSelectionBtn.addEventListener("click", () => {
    state.selectedCardId = null;
    fillCardDetailForm(null);
    announce("Card detail selection cleared.");
    render();
  });
}

dom.askBoardBtn.addEventListener("click", async () => {
  if (!state.boardId) {
    log("Create a board before using ask-board.");
    return;
  }

  const question = dom.askBoardQuestion.value.trim();
  if (!question) {
    log("Ask-board question is required.");
    return;
  }

  const topKValue = Number(dom.askBoardTopK.value);
  const topK =
    Number.isFinite(topKValue) && topKValue > 0 && topKValue <= 20
      ? Math.floor(topKValue)
      : undefined;

  const localJobId = `local-${Date.now()}`;
  const startedAt = nowIso();
  upsertAskJob({
    jobId: localJobId,
    question,
    status: "queued",
    createdAt: startedAt,
    updatedAt: startedAt,
    answer: "",
    references: [],
    errorMessage: ""
  });
  state.activeAskJobId = localJobId;
  state.askBoardStatus = "queued";
  announce("Ask-board job queued.");
  render();

  try {
    const queued = await callApi(
      "/ai/ask-board",
      "POST",
      {
        boardId: state.boardId,
        question,
        topK
      },
      "ask-board-enqueue"
    );

    renameAskJob(localJobId, queued.jobId);
    upsertAskJob({
      jobId: queued.jobId,
      question,
      status: "queued",
      createdAt: startedAt,
      updatedAt: nowIso(),
      answer: "",
      references: [],
      errorMessage: ""
    });
    state.activeAskJobId = queued.jobId;
    log("Queued ask-board", { jobId: queued.jobId });
    announce("Ask-board job is processing.");
    render();

    const status = await pollAskBoardResult(queued.jobId, 10, 1500, (nextStatus) => {
      upsertAskJob({
        jobId: queued.jobId,
        status: toUiStatus(nextStatus),
        updatedAt: nowIso()
      });
      state.askBoardStatus = toUiStatus(nextStatus);
      render();
    });

    if (status?.status === "completed" && status.answer) {
      upsertAskJob({
        jobId: queued.jobId,
        status: "completed",
        updatedAt: nowIso(),
        answer: status.answer.answer ?? "",
        references: status.answer.references ?? []
      });
      state.askBoardStatus = "completed";
      log("Ask-board completed", { jobId: queued.jobId });
      announce("Ask-board completed.");
      render();
      return;
    }

    if (status?.status === "failed") {
      upsertAskJob({
        jobId: queued.jobId,
        status: "failed",
        updatedAt: nowIso(),
        errorMessage: "Ask-board failed. Retry the question."
      });
      state.askBoardStatus = "failed";
      announce("Ask-board failed.");
      render();
      return;
    }

    upsertAskJob({
      jobId: queued.jobId,
      status: toUiStatus(status?.status ?? "queued"),
      updatedAt: nowIso(),
      errorMessage: "Still processing; run again in a moment."
    });
    state.askBoardStatus = toUiStatus(status?.status ?? "queued");
    render();
  } catch (error) {
    upsertAskJob({
      jobId: state.activeAskJobId ?? localJobId,
      status: "failed",
      updatedAt: nowIso(),
      errorMessage: error.message
    });
    state.askBoardStatus = "failed";
    log("Ask-board failed", { message: error.message });
    announce("Ask-board failed.");
    render();
  }
});

dom.copyEvalBundleBtn.addEventListener("click", async () => {
  const activeJob = getActiveAskJob();
  if (!activeJob || activeJob.status !== "completed") {
    log("No completed ask-board result to copy.");
    return;
  }

  const payload = buildEvalBundleText(activeJob);
  try {
    await navigator.clipboard.writeText(payload);
    log("Copied evaluation bundle.", { jobId: activeJob.jobId });
    announce("Evaluation bundle copied.");
  } catch (error) {
    log("Copy failed", { message: error.message });
  }
});

dom.askBoardQuestion.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    dom.askBoardBtn.click();
  }
});

if (dom.toggleSettingsBtn && dom.settingsShell) {
  syncToggleExpanded(dom.toggleSettingsBtn, !dom.settingsShell.classList.contains("is-collapsed"));
  dom.toggleSettingsBtn.addEventListener("click", () => {
    dom.settingsShell.classList.toggle("is-collapsed");
    const isExpanded = !dom.settingsShell.classList.contains("is-collapsed");
    syncToggleExpanded(dom.toggleSettingsBtn, isExpanded);
  });
}

if (dom.toggleDiagnosticsBtn && dom.diagnosticsShell) {
  syncToggleExpanded(
    dom.toggleDiagnosticsBtn,
    !dom.diagnosticsShell.classList.contains("is-collapsed")
  );
  dom.toggleDiagnosticsBtn.addEventListener("click", () => {
    dom.diagnosticsShell.classList.toggle("is-collapsed");
    const isExpanded = !dom.diagnosticsShell.classList.contains("is-collapsed");
    syncToggleExpanded(dom.toggleDiagnosticsBtn, isExpanded);
  });
}

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
    await callApi("/discord/guilds", "POST", { guildId }, "discord-upsert-guild");
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
    await callApi(
      "/discord/channel-mappings",
      "POST",
      {
        guildId,
        channelId,
        boardId: state.boardId,
        defaultListId: defaultListId || null
      },
      "discord-upsert-channel"
    );
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
