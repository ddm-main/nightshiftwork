// Only Microsoft's published-calendar hosts are accepted, so the fetch proxy cannot be pointed anywhere else.
export const CALENDAR_HOSTS = ["outlook.office365.com", "outlook.office.com", "outlook.live.com", "calendar.live.com"];

export function validateCalendarUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim().replace(/^webcal:/i, "https:"));
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!CALENDAR_HOSTS.includes(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}
