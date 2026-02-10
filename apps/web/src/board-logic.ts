export interface BoardCard {
  id: string;
  listId: string;
  position: number;
  title: string;
  version: number;
}

export interface DragMovePlan {
  cardId: string;
  toListId: string;
  expectedVersion: number;
  position: number;
}

const POSITION_STEP = 1024;

const sortByPosition = (cards: BoardCard[]): BoardCard[] =>
  [...cards].sort((a, b) => a.position - b.position);

export const computePositionForAppend = (cardsInList: BoardCard[]): number => {
  if (cardsInList.length === 0) {
    return POSITION_STEP;
  }

  const sorted = sortByPosition(cardsInList);
  const last = sorted[sorted.length - 1];
  return last.position + POSITION_STEP;
};

export const computePositionForIndex = (
  cardsInList: BoardCard[],
  targetIndex: number
): number => {
  const sorted = sortByPosition(cardsInList);

  if (sorted.length === 0) {
    return POSITION_STEP;
  }

  if (targetIndex <= 0) {
    return sorted[0].position / 2;
  }

  if (targetIndex >= sorted.length) {
    return computePositionForAppend(sorted);
  }

  const before = sorted[targetIndex - 1];
  const after = sorted[targetIndex];
  return (before.position + after.position) / 2;
};

export const planDragMove = (
  cards: BoardCard[],
  cardId: string,
  toListId: string,
  targetIndex: number
): DragMovePlan => {
  const card = cards.find((item) => item.id === cardId);
  if (!card) {
    throw new Error(`Card not found: ${cardId}`);
  }

  const destinationCards = cards.filter(
    (item) => item.listId === toListId && item.id !== cardId
  );
  const nextPosition = computePositionForIndex(destinationCards, targetIndex);

  return {
    cardId,
    toListId,
    expectedVersion: card.version,
    position: nextPosition
  };
};

export const applyOptimisticMove = (
  cards: BoardCard[],
  plan: DragMovePlan
): BoardCard[] =>
  cards.map((card) =>
    card.id === plan.cardId
      ? {
          ...card,
          listId: plan.toListId,
          position: plan.position,
          version: card.version + 1
        }
      : card
  );
