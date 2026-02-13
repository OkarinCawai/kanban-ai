import type { Card, CardChecklistItem } from "@kanban/contracts";

import { parseCsv } from "./formatting";

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

export const parseLabelsText = (
  value: string
): { id?: string; name: string; color: string }[] => {
  if (!value.trim()) {
    return [];
  }

  const labels: { id?: string; name: string; color: string }[] = [];
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

export const parseChecklistText = (
  value: string,
  existingChecklist: CardChecklistItem[] = []
): { id?: string; title: string; isDone?: boolean; position?: number }[] => {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const existingByTitle = new Map(
    existingChecklist.map((item) => [item.title.trim().toLowerCase(), item])
  );

  return lines.map((line, index) => {
    const done = /^\\[(x|X)\\]\\s*/.test(line);
    const title = line.replace(/^\\[(x|X|\\s)\\]\\s*/, "").trim();
    const prior = existingByTitle.get(title.toLowerCase());
    return {
      id: prior?.id,
      title,
      isDone: done,
      position: index * 1024
    };
  });
};

export const calcChecklistProgress = (card: Pick<Card, "checklist">): { total: number; done: number } => {
  const checklist = card.checklist ?? [];
  const total = checklist.length;
  const done = checklist.filter((item) => item.isDone).length;
  return { total, done };
};

export const getDueBadge = (
  card: Pick<Card, "dueAt">
): { text: string; className: string } | null => {
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

