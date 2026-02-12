import {
  geminiAskBoardOutputSchema,
  geminiCardSummaryOutputSchema,
  type GeminiAskBoardOutput,
  type GeminiCardSummaryOutput
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

    let parsedCandidate: unknown;
    try {
      parsedCandidate = JSON.parse(stripJsonCodeFence(candidateText));
    } catch (error) {
      throw new Error(
        `Gemini candidate was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return schema.parse(parsedCandidate);
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
