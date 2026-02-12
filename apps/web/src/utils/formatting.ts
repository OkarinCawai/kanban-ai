export const nowIso = (): string => new Date().toISOString();

export const formatTimestamp = (value: string | undefined): string => {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "n/a";
  }

  return date.toLocaleString();
};

export const formatElapsed = (
  startIso: string | undefined,
  endIso = nowIso()
): string => {
  if (!startIso) {
    return "0s";
  }

  const start = new Date(startIso).valueOf();
  const end = new Date(endIso).valueOf();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "0s";
  }

  const elapsed = Math.max(0, Math.floor((end - start) / 1000));
  if (elapsed < 60) {
    return `${elapsed}s`;
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m ${seconds}s`;
};

export const toDateTimeLocalValue = (
  isoValue: string | null | undefined
): string => {
  if (!isoValue) {
    return "";
  }

  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }

  const local = new Date(parsed.valueOf() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const fromDateTimeLocalValue = (
  localValue: string | null | undefined
): string | null => {
  if (!localValue) {
    return null;
  }

  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
};

export const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
