import * as Sentry from "@sentry/node";

const DEFAULT_SENTRY_DSN =
  "https://b249f808438a5652b4f432479a962902@o4510877938155520.ingest.de.sentry.io/4510878183718992";

let initialized = false;

export const initSentry = (): void => {
  if (initialized) {
    return;
  }

  initialized = true;

  const dsn = (process.env.SENTRY_DSN ?? "").trim() || DEFAULT_SENTRY_DSN;

  Sentry.init({
    dsn,
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    enableLogs: true
  });

  Sentry.setTag("app", "worker");
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error("Unknown error");
  }
};

export const captureException = (error: unknown, extra?: Record<string, unknown>): void => {
  const err = toError(error);
  if (extra) {
    Sentry.captureException(err, { extra });
    return;
  }

  Sentry.captureException(err);
};

export const flushSentry = async (timeoutMs = 2000): Promise<void> => {
  await Sentry.flush(timeoutMs);
};

