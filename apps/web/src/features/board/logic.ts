import { callApi } from "../../api/client.js";
import { state, type CardState } from "../../state/store.js";

export const sortedCardsForList = (listId: string): CardState[] =>
  state.cards
    .filter((card) => card.listId === listId)
    .sort((a, b) => a.position - b.position);

export const appendPosition = (cards: CardState[]): number => {
  if (cards.length === 0) {
    return 1024;
  }

  return cards[cards.length - 1].position + 1024;
};

export const moveCardToList = async (
  card: CardState,
  toListId: string
): Promise<CardState> => {
  const destination = sortedCardsForList(toListId).filter(
    (item) => item.id !== card.id
  );
  const nextPosition = appendPosition(destination);

  const moved = await callApi<CardState>(
    `/cards/${card.id}/move`,
    "PATCH",
    {
      toListId,
      position: nextPosition,
      expectedVersion: card.version
    },
    "card-move"
  );

  state.cards = state.cards.map((item) => (item.id === moved.id ? moved : item));
  state.movedCardAtByCardId[moved.id] = Date.now();
  return moved;
};
