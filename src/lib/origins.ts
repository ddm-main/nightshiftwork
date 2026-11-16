// The app runs in two places: local development and the published Lovable site.
export const DEV_ORIGIN = "http://localhost:8080";
export const PUBLISHED_ORIGIN = "https://nightshiftwork.lovable.app";

/** Every address the app may be opened from (development, published, and whatever is open right now). */
export function knownOrigins(current: string): string[] {
  return [...new Set([DEV_ORIGIN, PUBLISHED_ORIGIN, current])];
}
