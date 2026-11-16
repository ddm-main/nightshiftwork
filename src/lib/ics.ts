export type IcsEvent = { title: string; startsAt: string; endsAt: string | null; description: string };

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");
}

const TZ_OFFSETS: Record<string, number> = { "Asia/Kolkata": 330, "India Standard Time": 330, UTC: 0 };

function parseStamp(value: string, params: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const tzid = params.match(/TZID=([^;:]+)/)?.[1];
  const offsetMinutes = z ? 0 : tzid && tzid in TZ_OFFSETS ? TZ_OFFSETS[tzid]! : 330; // floating times are read as IST
  return new Date(utc - offsetMinutes * 60_000).toISOString();
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { current = { title: "", description: "", endsAt: null }; continue; }
    if (line === "END:VEVENT") {
      if (current?.title && current.startsAt) events.push({ title: current.title, startsAt: current.startsAt, endsAt: current.endsAt ?? null, description: current.description ?? "" });
      current = null;
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [name = "", ...paramParts] = line.slice(0, idx).split(";");
    const params = paramParts.join(";");
    const value = line.slice(idx + 1);
    if (name === "SUMMARY") current.title = unescape(value);
    else if (name === "DESCRIPTION") current.description = unescape(value);
    else if (name === "DTSTART") { const stamp = parseStamp(value, params); if (stamp) current.startsAt = stamp; }
    else if (name === "DTEND") current.endsAt = parseStamp(value, params);
  }
  return events;
}
