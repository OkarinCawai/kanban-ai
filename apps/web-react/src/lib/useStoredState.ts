import { useEffect, useState } from "react";

export const readStoredValue = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeStoredValue = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
};

export const removeStoredValue = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const useStoredState = (
  key: string,
  initialValue: string
): [string, (next: string) => void] => {
  const [value, setValue] = useState(() => readStoredValue(key) ?? initialValue);

  useEffect(() => {
    writeStoredValue(key, value);
  }, [key, value]);

  return [value, setValue];
};

