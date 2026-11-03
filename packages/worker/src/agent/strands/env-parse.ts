/**
 * Shared env parsing for the strands kiro-acp modules (watchdog-controller,
 * kiro-acp-agent). Consolidates what used to be near-identical `parseMsEnv`
 * copies into one place.
 */

/**
 * Parse a non-negative integer (milliseconds) from an env var, falling back to
 * `fallbackMs` when the var is unset / empty / not a finite, non-negative
 * number.
 */
export const parseMsEnv = (name: string, fallbackMs: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallbackMs;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallbackMs;
};


