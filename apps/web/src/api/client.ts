import {
  recordFeatureError,
  recordRequestEvent,
  state
} from "../state/store.js";
import { nowIso } from "../utils/formatting.js";
import { config } from "./config.js";

type RecordedError = Error & { __kanbanRecorded?: "1" };

const readMessage = (payload: unknown, fallback: string): string => {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
};

const authHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-org-id": config.orgId,
    "x-role": config.role
  };

  if (state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  } else {
    headers["x-user-id"] = config.userId;
  }

  return headers;
};

export const callApi = async <T = unknown>(
  path: string,
  method: string,
  body?: unknown,
  feature = "generic"
): Promise<T> => {
  const started = Date.now();
  const localRequestId = `web-${++state.diagnostics.requestCount}`;

  try {
    const response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = (await response.json().catch(() => ({}))) as unknown;
    const durationMs = Date.now() - started;

    recordRequestEvent({
      localRequestId,
      apiRequestId: response.headers.get("x-request-id"),
      feature,
      method,
      path,
      status: response.status,
      durationMs,
      at: nowIso()
    });

    if (!response.ok) {
      const message = readMessage(payload, `Request failed: ${response.status}`);
      recordFeatureError(feature, message);
      const apiError: RecordedError = new Error(message);
      apiError.__kanbanRecorded = "1";
      throw apiError;
    }

    return payload as T;
  } catch (error) {
    const recorded = error as RecordedError;
    if (recorded.__kanbanRecorded === "1") {
      throw error;
    }

    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    recordRequestEvent({
      localRequestId,
      apiRequestId: null,
      feature,
      method,
      path,
      status: "network-error",
      durationMs,
      at: nowIso()
    });
    recordFeatureError(feature, message);
    throw error;
  }
};
