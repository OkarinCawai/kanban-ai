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

