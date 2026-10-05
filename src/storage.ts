// localStorage that may be missing or refuse writes (a private window, blocked
// site data, a full quota): reads fall back to null and writes are dropped, so
// what is stored lasts for this session only. Parsing stays with each caller.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
