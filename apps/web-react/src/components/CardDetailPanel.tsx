import React, { useEffect, useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { richTextDocSchema, type Card, type RichTextDoc } from "@kanban/contracts";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

import { ApiError, type ApiClient } from "../lib/api";
import { fromDateTimeLocalValue, parseCsv, toDateTimeLocalValue } from "../lib/formatting";
import { parseChecklistText, parseLabelsText } from "../lib/card-metadata";

export interface CardDetailPanelProps {
  api: ApiClient;
  selectedCard: Card | null;
  onClearSelection: () => void;
  onError: (message: string) => void;
}

export const CardDetailPanel = (props: CardDetailPanelProps) => {
  const queryClient = useQueryClient();

  const updateCardMutation = useMutation({
    mutationFn: async (args: { cardId: string; patch: unknown }) =>
      props.api.updateCard(args.cardId, args.patch),
    onSuccess: (card) => {
      queryClient.setQueryData<Card[]>(["cards", card.boardId], (prev) =>
        (prev ?? []).map((item) => (item.id === card.id ? card : item))
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && props.selectedCard) {
        queryClient
          .invalidateQueries({ queryKey: ["cards", props.selectedCard.boardId] })
          .catch(() => undefined);
        queryClient
          .invalidateQueries({ queryKey: ["lists", props.selectedCard.boardId] })
          .catch(() => undefined);
      }
      props.onError(error instanceof Error ? error.message : String(error));
    }
  });

  const [detailTitle, setDetailTitle] = useState("");
  const [detailAssignees, setDetailAssignees] = useState("");
  const [detailStartAt, setDetailStartAt] = useState("");
  const [detailDueAt, setDetailDueAt] = useState("");
  const [detailLocationText, setDetailLocationText] = useState("");
  const [detailLocationUrl, setDetailLocationUrl] = useState("");
  const [detailLabels, setDetailLabels] = useState("");
  const [detailChecklist, setDetailChecklist] = useState("");
  const [detailCommentCount, setDetailCommentCount] = useState("0");
  const [detailAttachmentCount, setDetailAttachmentCount] = useState("0");

  const emptyDoc: RichTextDoc = useMemo(
    () => ({
      type: "doc",
      content: [{ type: "paragraph" }]
    }),
    []
  );

  const plainTextToDoc = (value: string): RichTextDoc => {
    const normalized = value.replace(/\r\n/g, "\n");
    const lines = normalized.split(/\n/);
    return {
      type: "doc",
      content: lines.map((line) =>
        line
          ? { type: "paragraph", content: [{ type: "text", text: line }] }
          : { type: "paragraph" }
      )
    };
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] }
      }),
      Placeholder.configure({
        placeholder: "Write a description. Bold, lists, and code are supported."
      })
    ],
    content: emptyDoc,
    editable: Boolean(props.selectedCard)
  });

  const hydrateFromCard = (card: Card | null) => {
    if (!card) {
      setDetailTitle("");
      setDetailAssignees("");
      setDetailStartAt("");
      setDetailDueAt("");
      setDetailLocationText("");
      setDetailLocationUrl("");
      setDetailLabels("");
      setDetailChecklist("");
      setDetailCommentCount("0");
      setDetailAttachmentCount("0");
      return;
    }

    setDetailTitle(card.title ?? "");
    setDetailAssignees((card.assigneeUserIds ?? []).join(", "));
    setDetailStartAt(toDateTimeLocalValue(card.startAt));
    setDetailDueAt(toDateTimeLocalValue(card.dueAt));
    setDetailLocationText(card.locationText ?? "");
    setDetailLocationUrl(card.locationUrl ?? "");
    setDetailLabels((card.labels ?? []).map((label) => `${label.name}:${label.color}`).join(", "));
    setDetailChecklist(
      [...(card.checklist ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((item) => `${item.isDone ? "[x]" : "[ ]"} ${item.title}`)
        .join("\n")
    );
    setDetailCommentCount(String(card.commentCount ?? 0));
    setDetailAttachmentCount(String(card.attachmentCount ?? 0));
  };

  useEffect(() => {
    hydrateFromCard(props.selectedCard);
  }, [props.selectedCard?.id, props.selectedCard?.version]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const card = props.selectedCard;
    editor.setEditable(Boolean(card));

    const nextDoc =
      card?.descriptionRich ??
      (card?.description ? plainTextToDoc(card.description) : emptyDoc);

    // Avoid polluting undo history when switching cards.
    editor.commands.setContent(nextDoc, { emitUpdate: false });
  }, [editor, emptyDoc, props.selectedCard?.id, props.selectedCard?.version]);

  const handleSaveDetails = async (event: React.FormEvent) => {
    event.preventDefault();

    const card = props.selectedCard;
    if (!card) {
      props.onError("Select a card before saving details.");
      return;
    }

    const title = detailTitle.trim();
    if (!title) {
      props.onError("Title is required.");
      return;
    }

    const startAt = fromDateTimeLocalValue(detailStartAt);
    const dueAt = fromDateTimeLocalValue(detailDueAt);
    if (startAt && dueAt && new Date(dueAt).valueOf() < new Date(startAt).valueOf()) {
      props.onError("Due date must be equal or later than start date.");
      return;
    }

    const commentCount = Number.parseInt(detailCommentCount, 10);
    const attachmentCount = Number.parseInt(detailAttachmentCount, 10);
    if (!Number.isInteger(commentCount) || commentCount < 0) {
      props.onError("Comment count must be a non-negative integer.");
      return;
    }
    if (!Number.isInteger(attachmentCount) || attachmentCount < 0) {
      props.onError("Attachment count must be a non-negative integer.");
      return;
    }

    const locationText = detailLocationText.trim();
    const locationUrl = detailLocationUrl.trim();

    let labels;
    let checklist;
    try {
      labels = parseLabelsText(detailLabels);
      checklist = parseChecklistText(detailChecklist, card.checklist ?? []);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
      return;
    }

    if (!editor) {
      props.onError("Description editor is not ready yet.");
      return;
    }

    const descriptionRich = richTextDocSchema.parse(editor.getJSON());
    const descriptionPlain = editor.getText().trim();

    const patch = {
      expectedVersion: card.version,
      title,
      description: descriptionPlain ? descriptionPlain : null,
      descriptionRich: descriptionPlain ? descriptionRich : null,
      startAt,
      dueAt,
      locationText: locationText ? locationText : null,
      locationUrl: locationUrl ? locationUrl : null,
      assigneeUserIds: parseCsv(detailAssignees),
      labels,
      checklist,
      commentCount,
      attachmentCount
    };

    const updated = await updateCardMutation.mutateAsync({ cardId: card.id, patch });
    hydrateFromCard(updated);
  };

  const card = props.selectedCard;

  return (
    <article className="panel card-detail-panel">
      <h2>Card Detail Editor</h2>
      <p className="meta">
        Selected card: <span>{card?.id ?? "none"}</span>
      </p>
      <p className="meta">
        {card ? `Editing ${card.title}` : "Select a card from the board to edit details."}
      </p>
      <form className={`detail-form ${card ? "" : "is-disabled"}`} onSubmit={handleSaveDetails}>
        <label>
          Title
          <input value={detailTitle} onChange={(e) => setDetailTitle(e.target.value)} disabled={!card} />
        </label>
        <div className="rich-field" aria-label="Description">
          <div className="rich-label">Description</div>
          <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("bold") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!card || !editor?.can().chain().focus().toggleBold().run()}
              aria-pressed={Boolean(editor?.isActive("bold"))}
            >
              Bold
            </button>
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("italic") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!card || !editor?.can().chain().focus().toggleItalic().run()}
              aria-pressed={Boolean(editor?.isActive("italic"))}
            >
              Italic
            </button>
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("strike") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
              disabled={!card || !editor?.can().chain().focus().toggleStrike().run()}
              aria-pressed={Boolean(editor?.isActive("strike"))}
            >
              Strike
            </button>
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("bulletList") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              disabled={!card || !editor?.can().chain().focus().toggleBulletList().run()}
              aria-pressed={Boolean(editor?.isActive("bulletList"))}
            >
              Bullets
            </button>
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("orderedList") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              disabled={!card || !editor?.can().chain().focus().toggleOrderedList().run()}
              aria-pressed={Boolean(editor?.isActive("orderedList"))}
            >
              Numbered
            </button>
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("code") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleCode().run()}
              disabled={!card || !editor?.can().chain().focus().toggleCode().run()}
              aria-pressed={Boolean(editor?.isActive("code"))}
            >
              Code
            </button>
            <button
              type="button"
              className={`rich-btn ${editor?.isActive("codeBlock") ? "is-active" : ""}`}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
              disabled={!card || !editor?.can().chain().focus().toggleCodeBlock().run()}
              aria-pressed={Boolean(editor?.isActive("codeBlock"))}
            >
              Code Block
            </button>
            <button
              type="button"
              className="rich-btn"
              onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
              disabled={!card || !editor}
            >
              Clear
            </button>
          </div>
          <div className={`rich-surface ${card ? "" : "is-disabled"}`}>
            <EditorContent editor={editor} />
          </div>
          <p className="meta rich-hint">
            Stored as rich JSON; keyword search uses the derived plain text.
          </p>
        </div>
        <label>
          Assignee UUIDs (comma separated)
          <input
            value={detailAssignees}
            onChange={(e) => setDetailAssignees(e.target.value)}
            disabled={!card}
          />
        </label>
        <div className="detail-grid">
          <label>
            Start At
            <input
              type="datetime-local"
              value={detailStartAt}
              onChange={(e) => setDetailStartAt(e.target.value)}
              disabled={!card}
            />
          </label>
          <label>
            Due At
            <input
              type="datetime-local"
              value={detailDueAt}
              onChange={(e) => setDetailDueAt(e.target.value)}
              disabled={!card}
            />
          </label>
        </div>
        <label>
          Location Text
          <input
            value={detailLocationText}
            onChange={(e) => setDetailLocationText(e.target.value)}
            disabled={!card}
          />
        </label>
        <label>
          Location URL
          <input value={detailLocationUrl} onChange={(e) => setDetailLocationUrl(e.target.value)} disabled={!card} />
        </label>
        <label>
          Labels (name:color comma separated)
          <input value={detailLabels} onChange={(e) => setDetailLabels(e.target.value)} disabled={!card} />
        </label>
        <label>
          Checklist (one item per line, prefix [x] for done)
          <textarea
            rows={5}
            value={detailChecklist}
            onChange={(e) => setDetailChecklist(e.target.value)}
            disabled={!card}
          />
        </label>
        <div className="detail-grid">
          <label>
            Comment Count
            <input
              type="number"
              min={0}
              step={1}
              value={detailCommentCount}
              onChange={(e) => setDetailCommentCount(e.target.value)}
              disabled={!card}
            />
          </label>
          <label>
            Attachment Count
            <input
              type="number"
              min={0}
              step={1}
              value={detailAttachmentCount}
              onChange={(e) => setDetailAttachmentCount(e.target.value)}
              disabled={!card}
            />
          </label>
        </div>
        <div className="inline top-gap">
          <button type="submit" disabled={!card}>
            Save Details
          </button>
          <button type="button" onClick={props.onClearSelection}>
            Clear Selection
          </button>
        </div>
      </form>
    </article>
  );
};
