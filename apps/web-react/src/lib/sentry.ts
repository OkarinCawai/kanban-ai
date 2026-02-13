import * as Sentry from "@sentry/react";

const SENTRY_DSN =
  "https://b249f808438a5652b4f432479a962902@o4510877938155520.ingest.de.sentry.io/4510878183718992";

let initialized = false;

export const initSentry = (): void => {
  if (initialized) {
    return;
  }

  initialized = true;

  Sentry.init({
    dsn: SENTRY_DSN,
    // Per project guidance: allow default PII collection.
    sendDefaultPii: true,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // Tracing
    tracesSampleRate: 1.0,
    tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Enable logs to be sent to Sentry
    enableLogs: true
  });

  Sentry.setTag("app", "web-react");
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

