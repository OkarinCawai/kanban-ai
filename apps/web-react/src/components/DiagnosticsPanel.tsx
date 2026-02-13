import * as Sentry from "@sentry/react";
import React from "react";

export interface DiagnosticsPanelProps {
  isOpen: boolean;
  lastError: string | null;
}

const sentryMetrics = Sentry as unknown as {
  metrics?: {
    count?: (name: string, value: number) => void;
  };
};

const ErrorButton = () => {
  return (
    <button
      type="button"
      onClick={() => {
        const { logger } = Sentry;
        logger?.info?.("User triggered test error", {
          action: "test_error_button_click"
        });
        sentryMetrics.metrics?.count?.("test_counter", 1);
        throw new Error("This is your first error!");
      }}
    >
      Break the world
    </button>
  );
};

export const DiagnosticsPanel = (props: DiagnosticsPanelProps) => {
  return (
    <section
      id="diagnosticsShell"
      className={`diagnostics-shell ${props.isOpen ? "" : "is-collapsed"}`}
    >
      <article className="panel">
        <h2>Diagnostics</h2>
        <pre>{props.lastError ? `Last error: ${props.lastError}` : "No errors recorded in this session."}</pre>
        <div className="inline top-gap">
          <ErrorButton />
        </div>
      </article>
    </section>
  );
};
