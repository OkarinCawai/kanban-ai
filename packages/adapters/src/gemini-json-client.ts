import {
  geminiAskBoardOutputSchema,
  geminiCardSummaryOutputSchema,
  geminiThreadToCardOutputSchema,
  type GeminiAskBoardOutput,
  type GeminiCardSummaryOutput,
  type GeminiThreadToCardOutput
} from "@kanban/contracts";

const DEFAULT_GENERATION_MODEL = "gemini-2.0-flash";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-004";
const DEFAULT_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type JsonSchema<T> = {
  parse(input: unknown): T;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type GeminiEmbedResponse = {
  embedding?: {
    values?: number[];
  };
  embeddings?: Array<{
    values?: number[];
  }>;
};

export type GeminiSourceType = "card" | "comment" | "checklist" | "thread";

export interface GeminiAskBoardContext {
  chunkId: string;
  sourceType: GeminiSourceType;
  sourceId: string;
  excerpt: string;
}

export interface GenerateCardSummaryInput {
  cardTitle: string;
  cardDescription?: string;
  reason?: string;
}

export interface GenerateAskBoardAnswerInput {
  question: string;
  contexts: GeminiAskBoardContext[];
}

export interface GenerateThreadToCardDraftInput {
  threadName: string;
  transcript: string;
  participantDiscordUserIds?: string[];
}

const CARD_LABEL_COLORS = new Set([
  "gray",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "teal"
]);

const normalizeThreadToCardCandidate = (candidate: unknown): unknown => {
  if (!candidate || typeof candidate !== "object") {
    return candidate;
  }

  const result: Record<string, unknown> = { ...(candidate as Record<string, unknown>) };

  if (result.description === null) {
    delete result.description;
  }

  const checklistValue = result.checklist;
  if (Array.isArray(checklistValue)) {
    const normalizedChecklist = checklistValue
      .map((item, index) => {
        if (typeof item === "string") {
          const raw = item.trim();
          if (!raw) return null;

          const markedDone = raw.startsWith("x:") || raw.toLowerCase().startsWith("[x]");
          const title = raw
            .replace(/^x:\s*/i, "")
            .replace(/^\[x\]\s*/i, "")
            .trim();

          return title
            ? { title, isDone: markedDone, position: index * 1024 }
            : null;
        }

        if (item && typeof item === "object") {
          const copy: Record<string, unknown> = { ...(item as Record<string, unknown>) };

          if (typeof copy.title !== "string") {
            const task =
              typeof copy.task === "string"
                ? copy.task
                : typeof copy.text === "string"
                  ? copy.text
                  : null;
            if (task) {
              copy.title = task;
            }
          }

          if (typeof copy.isDone === "string") {
            const normalized = copy.isDone.trim().toLowerCase();
            if (normalized === "true") {
              copy.isDone = true;
            } else if (normalized === "false") {
              copy.isDone = false;
            }
          }

          if (typeof copy.position === "string") {
            const parsed = Number(copy.position);
            if (Number.isFinite(parsed)) {
              copy.position = parsed;
            }
          }

          return copy;
        }

        return null;
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));

    if (normalizedChecklist.length > 0) {
      result.checklist = normalizedChecklist;
    } else {
      delete result.checklist;
    }
  }

  const labelsValue = result.labels;
  if (Array.isArray(labelsValue)) {
    const normalizedLabels = labelsValue
      .map((item) => {
        if (typeof item === "string") {
          const raw = item.trim();
          if (!raw) return null;

          const [namePart, colorPart] = raw.includes(":") ? raw.split(":") : [raw, ""];
          const name = namePart?.trim() ?? "";
          const maybeColor = (colorPart ?? "").trim().toLowerCase();
          const color = CARD_LABEL_COLORS.has(maybeColor) ? maybeColor : "gray";

          return name ? { name, color } : null;
        }

        if (item && typeof item === "object") {
          const raw: Record<string, unknown> = { ...(item as Record<string, unknown>) };
          const name =
            typeof raw.name === "string"
              ? raw.name.trim()
              : typeof raw.label === "string"
                ? raw.label.trim()
                : "";

          if (!name) {
            return null;
          }

          const maybeColor =
            typeof raw.color === "string" ? raw.color.trim().toLowerCase() : "";
          const color = CARD_LABEL_COLORS.has(maybeColor) ? maybeColor : "gray";
          return { name, color };
        }

        return null;
      })
      .filter((item): item is { name: string; color: string } => Boolean(item));

    if (normalizedLabels.length > 0) {
      result.labels = normalizedLabels;
    } else {
      delete result.labels;
    }
  }

  const assignees = result.assigneeDiscordUserIds;
  if (typeof assignees === "string") {
    const trimmed = assignees.trim();
    result.assigneeDiscordUserIds = trimmed ? [trimmed] : [];
  } else if (Array.isArray(assignees)) {
    result.assigneeDiscordUserIds = assignees
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return result;
};

export interface GeminiJsonClientOptions {
  apiKey: string;
  model?: string;
  embeddingModel?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export type GeminiEmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface EmbedTextInput {
  text: string;
  taskType?: GeminiEmbeddingTaskType;
  title?: string;
}

const trimToDefault = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

const stripJsonCodeFence = (value: string): string =>
  value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

const truncate = (value: string, maxLength = 500): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

export class GeminiJsonClient {
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiJsonClientOptions) {
    this.model = trimToDefault(options.model, DEFAULT_GENERATION_MODEL);
    this.embeddingModel = trimToDefault(options.embeddingModel, DEFAULT_EMBEDDING_MODEL);
    this.apiBaseUrl = trimToDefault(options.apiBaseUrl, DEFAULT_API_BASE_URL);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateCardSummary(
    input: GenerateCardSummaryInput
  ): Promise<GeminiCardSummaryOutput> {
    const prompt = [
      "You summarize Kanban cards for busy teams.",
      "Return strict JSON with keys: summary, highlights, risks, actionItems.",
      "All arrays must contain short strings and must be grounded in the provided card.",
      "",
      `Card title: ${input.cardTitle.trim()}`,
      `Card description: ${input.cardDescription?.trim() || "(none provided)"}`,
      `Summary reason: ${input.reason?.trim() || "(none provided)"}`
    ].join("\n");

    return this.generateJson(prompt, geminiCardSummaryOutputSchema);
  }

  async generateAskBoardAnswer(
    input: GenerateAskBoardAnswerInput
  ): Promise<GeminiAskBoardOutput> {
    if (input.contexts.length === 0) {
      throw new Error("Ask-board generation requires at least one context snippet.");
    }

    const prompt = [
      "Answer the board question using only the provided context snippets.",
      "Return strict JSON with keys: answer, references.",
      "references must be an array and each entry must reuse chunkId, sourceType, and sourceId from the supplied contexts.",
      "Do not invent new references. If context is incomplete, acknowledge uncertainty in answer while still citing provided references.",
      "",
      `Question: ${input.question.trim()}`,
      "Contexts:",
      JSON.stringify(input.contexts, null, 2)
    ].join("\n");

    return this.generateJson(prompt, geminiAskBoardOutputSchema);
  }

  async generateThreadToCardDraft(
    input: GenerateThreadToCardDraftInput
  ): Promise<GeminiThreadToCardOutput> {
    const promptChecklistExample = JSON.stringify(
      [
        { title: "Follow up with release owner", isDone: false, position: 0 },
        { title: "Create rollback checklist", isDone: false, position: 1024 }
      ],
      null,
      2
    );
    const promptLabelsExample = JSON.stringify(
      [
        { name: "release", color: "orange" },
        { name: "ops", color: "red" }
      ],
      null,
      2
    );

    const prompt = [
      "You convert Discord thread discussions into a Kanban card draft.",
      "Return strict JSON only (no markdown).",
      "Keys: title, description, checklist, labels, assigneeDiscordUserIds.",
      "checklist must be an array of objects with: title (string), isDone (boolean), position (number).",
      `labels must be an array of objects with: name (string), color (one of: ${Array.from(CARD_LABEL_COLORS).join(", ")}).`,
      `Example checklist: ${promptChecklistExample}`,
      `Example labels: ${promptLabelsExample}`,
      "Checklist items must be concrete and short.",
      "Only choose assigneeDiscordUserIds from the provided participants list.",
      "If assignees are unclear, return an empty assigneeDiscordUserIds array.",
      "",
      `Thread name: ${input.threadName.trim()}`,
      `Participant Discord IDs: ${JSON.stringify(input.participantDiscordUserIds ?? [])}`,
      "Thread transcript:",
      input.transcript.trim()
    ].join("\n");

    const candidate = await this.generateJsonCandidate(prompt);
    const normalized = normalizeThreadToCardCandidate(candidate);
    return geminiThreadToCardOutputSchema.parse(normalized);
  }

  async embedText(input: string | EmbedTextInput): Promise<number[]> {
    const normalized = typeof input === "string" ? { text: input } : input;
    const text = normalized.text.trim();

    if (!text) {
      throw new Error("Embedding text cannot be empty.");
    }

    const endpoint =
      `${this.apiBaseUrl}/models/${encodeURIComponent(this.embeddingModel)}:embedContent` +
      `?key=${encodeURIComponent(this.options.apiKey)}`;

    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }]
        },
        taskType: normalized.taskType ?? "RETRIEVAL_DOCUMENT",
        title: normalized.title?.trim()
      })
    });

    const parsed = await this.parseApiJson<GeminiEmbedResponse>(response);
    const values = parsed.embedding?.values ?? parsed.embeddings?.[0]?.values;

    if (!values || values.length === 0) {
      throw new Error("Gemini embedding response did not include numeric values.");
    }

    if (!values.every((value) => Number.isFinite(value))) {
      throw new Error("Gemini embedding response contained non-finite values.");
    }

    return values;
  }

  private async generateJson<T>(prompt: string, schema: JsonSchema<T>): Promise<T> {
    const candidate = await this.generateJsonCandidate(prompt);
    return schema.parse(candidate);
  }

  private async generateJsonCandidate(prompt: string): Promise<unknown> {
    const endpoint =
      `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.options.apiKey)}`;

    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      })
    });

    const parsedResponse = await this.parseApiJson<GeminiGenerateResponse>(response);

    const candidateText = parsedResponse.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!candidateText) {
      throw new Error("Gemini response did not include a JSON candidate.");
    }

    try {
      return JSON.parse(stripJsonCodeFence(candidateText));
    } catch (error) {
      throw new Error(
        `Gemini candidate was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async parseApiJson<T>(response: Response): Promise<T> {
    const rawResponse = await response.text();
    if (!response.ok) {
      throw new Error(
        `Gemini request failed (${response.status}): ${truncate(rawResponse)}`
      );
    }

    try {
      return JSON.parse(rawResponse) as T;
    } catch (error) {
      throw new Error(
        `Gemini response was not JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
