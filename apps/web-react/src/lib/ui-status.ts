export type UiStatus = "idle" | "queued" | "processing" | "completed" | "failed";

export const toUiStatus = (value: unknown): UiStatus => {
  if (
    value === "queued" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }

  return "idle";
};

