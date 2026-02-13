import React, { useMemo, useState } from "react";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import type { Card, CardSummaryResult, KanbanList } from "@kanban/contracts";

import type { ApiClient } from "../lib/api";
import { formatTimestamp } from "../lib/formatting";
import { calcChecklistProgress, getDueBadge } from "../lib/card-metadata";
import { computePositionForAppend, planDragMove, type DragMovePlan } from "../lib/ordering";
import { useCardAiJobs } from "../lib/useCardAiJobs";

export interface BoardCanvasProps {
  api: ApiClient;
  lists: KanbanList[];
  cards: Card[];
  onCreateCard: (args: { listId: string; title: string; position: number }) => void;
  onMoveCard: (plan: DragMovePlan) => void;
  onSelectCard: (cardId: string) => void;
  onMoveToAdjacentList: (card: Card, direction: -1 | 1) => void;
  onError: (message: string) => void;
}

const renderCardSummaryPanel = (summary: CardSummaryResult["summary"] | undefined) => {
  if (!summary) {
    return null;
  }

  return (
    <div className="card-summary">
      <p className="meta">{summary.summary}</p>
      {summary.actionItems?.length ? (
        <>
          <h4 className="eyebrow">Action Items</h4>
          <ul className="reference-list">
            {summary.actionItems.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
};

export const BoardCanvas = (props: BoardCanvasProps) => {
  const [newCardTitleByListId, setNewCardTitleByListId] = useState<Record<string, string>>({});

  const aiJobs = useCardAiJobs(props.api, props.onError);

  const cardsByListId = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of props.cards) {
      const bucket = map.get(card.listId) ?? [];
      bucket.push(card);
      map.set(card.listId, bucket);
    }

    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.position - b.position);
    }

    return map;
  }, [props.cards]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const { droppableId: toListId, index: targetIndex } = result.destination;
    const cardId = result.draggableId;

    try {
      const plan = planDragMove(props.cards, cardId, toListId, targetIndex);
      props.onMoveCard(plan);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCreateCard = (list: KanbanList) => {
    const title = (newCardTitleByListId[list.id] ?? "").trim();
    if (!title) {
      props.onError("Card title is required.");
      return;
    }

    const cardsInList = cardsByListId.get(list.id) ?? [];
    const position = computePositionForAppend(cardsInList);

    props.onCreateCard({ listId: list.id, title, position });
    setNewCardTitleByListId((prev) => ({ ...prev, [list.id]: "" }));
  };

  const renderCardBadges = (card: Card) => {
    const badges: { text: string; className: string }[] = [];

    const dueBadge = getDueBadge(card);
    if (dueBadge) {
      badges.push({ text: dueBadge.text, className: dueBadge.className });
    }

    const checklist = calcChecklistProgress(card);
    if (checklist.total > 0) {
      badges.push({
        text: `check ${checklist.done}/${checklist.total}`,
        className: "badge-checklist"
      });
    }

    const assigneeCount = (card.assigneeUserIds ?? []).length;
    if (assigneeCount > 0) {
      badges.push({ text: `assignees ${assigneeCount}`, className: "badge-assignees" });
    }

    const commentCount = card.commentCount ?? 0;
    if (commentCount > 0) {
      badges.push({ text: `comments ${commentCount}`, className: "badge-count" });
    }

    const attachmentCount = card.attachmentCount ?? 0;
    if (attachmentCount > 0) {
      badges.push({ text: `files ${attachmentCount}`, className: "badge-count" });
    }

    for (const label of card.labels ?? []) {
      badges.push({
        text: label.name,
        className: `badge-label badge-label-${String(label.color ?? "gray").toLowerCase()}`
      });
    }

    return (
      <div className="card-badges" aria-label="Card metadata badges">
        {badges.map((badge, index) => (
          <span key={`${badge.text}-${index}`} className={`meta-badge ${badge.className}`.trim()}>
            {badge.text}
          </span>
        ))}
      </div>
    );
  };

  return (
    <article className="panel board-canvas">
      <div className="section-head">
        <h2>Board Canvas</h2>
        <p className="meta">Drag cards across lists; moves apply optimistic feedback.</p>
      </div>

      <section className="board" id="boardColumns" role="list" aria-label="Kanban board columns">
        <DragDropContext onDragEnd={onDragEnd}>
          {props.lists.map((list) => {
            const cardsForList = cardsByListId.get(list.id) ?? [];

            return (
              <article key={list.id} className="column">
                <header>
                  <h3 className="list-title">{list.title}</h3>
                </header>
                <Droppable droppableId={list.id}>
                  {(dropProvided) => (
                    <div className="cards" ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                      {cardsForList.map((card, index) => {
                        const summaryStatus = aiJobs.cardSummaryStatusByCardId[card.id] ?? "idle";
                        const coverStatus = aiJobs.cardCoverStatusByCardId[card.id] ?? "idle";
                        const summaryUpdatedAt = aiJobs.cardSummaryUpdatedAtByCardId[card.id];
                        const coverUpdatedAt = aiJobs.cardCoverUpdatedAtByCardId[card.id];
                        const coverUrl = aiJobs.cardCoverUrlByCardId[card.id] ?? "";
                        const summary = aiJobs.cardSummaryByCardId[card.id];

                        return (
                          <Draggable key={card.id} draggableId={card.id} index={index}>
                            {(dragProvided) => (
                              <div
                                className="card"
                                id={`card-${card.id}`}
                                data-card-id={card.id}
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                onClick={() => props.onSelectCard(card.id)}
                                role="listitem"
                              >
                                <div
                                  className={`card-cover-shell ${coverUrl ? "" : "is-empty"}`}
                                  aria-hidden="true"
                                >
                                  <img
                                    className="card-cover-img"
                                    alt=""
                                    loading="lazy"
                                    src={coverUrl || undefined}
                                  />
                                </div>
                                <div className="card-head">
                                  <div className="card-title">{card.title}</div>
                                  <div className="card-meta">v{card.version}</div>
                                </div>

                                {renderCardBadges(card)}

                                <div className="card-status-stack" aria-label="Card async job statuses">
                                  <div className="card-status-row">
                                    <span className={`status-chip card-cover-status status-${coverStatus}`}>
                                      cover {coverStatus}
                                    </span>
                                    <span className="card-cover-updated-at">
                                      {coverUpdatedAt ? formatTimestamp(coverUpdatedAt) : "no cover yet"}
                                    </span>
                                  </div>
                                  <div className="card-status-row">
                                    <span className={`status-chip card-summary-status status-${summaryStatus}`}>
                                      summary {summaryStatus}
                                    </span>
                                    <span className="card-summary-updated-at">
                                      {summaryUpdatedAt ? formatTimestamp(summaryUpdatedAt) : "no summary yet"}
                                    </span>
                                  </div>
                                </div>

                                <div className="card-actions">
                                  <button type="button" onClick={() => props.onSelectCard(card.id)}>
                                    Details
                                  </button>
                                  <button type="button" onClick={() => void aiJobs.queueCardCover(card.id)}>
                                    Cover
                                  </button>
                                  <button type="button" onClick={() => void aiJobs.queueCardSummary(card.id)}>
                                    Summarize
                                  </button>
                                  <button type="button" onClick={() => props.onMoveToAdjacentList(card, -1)}>
                                    Move Left
                                  </button>
                                  <button type="button" onClick={() => props.onMoveToAdjacentList(card, 1)}>
                                    Move Right
                                  </button>
                                </div>

                                {renderCardSummaryPanel(summary)}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>

                <div className="inline">
                  <input
                    className="card-title-input"
                    placeholder="Card title"
                    value={newCardTitleByListId[list.id] ?? ""}
                    onChange={(e) =>
                      setNewCardTitleByListId((prev) => ({
                        ...prev,
                        [list.id]: e.target.value
                      }))
                    }
                  />
                  <button type="button" className="add-card-btn" onClick={() => handleCreateCard(list)}>
                    Add Card
                  </button>
                </div>
              </article>
            );
          })}
        </DragDropContext>
      </section>
    </article>
  );
};
