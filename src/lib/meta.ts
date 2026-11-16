// Tags, links and the meeting type live in a small footer inside an existing text field (task description,
// meeting agenda), so they need no database change and stay readable as plain text:
//
//   Fixed the checkout error.
//   ---
//   Tags: billing, urgent
//   Link: https://example.com/ticket/42
//   Type: external
export type MeetingKind = "internal" | "external";
export type Meta = { tags: string[]; links: string[]; kind: MeetingKind | null; log: boolean };

const LINE = /^(Tags|Link|Type|Logged):[ \t]?(.*)$/;
const EMPTY: Meta = { tags: [], links: [], kind: null, log: false };

export function normalizeTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,\n]/);
  const tags = parts.map((tag) => tag.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "")).filter(Boolean);
  return [...new Set(tags)].slice(0, 12);
}

export function normalizeLinks(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/\s+|\n/);
  return [...new Set(parts.map((link) => link.trim()).filter((link) => /^https?:\/\/\S+$/i.test(link)))].slice(0, 10);
}

export function parseMeta(text: string): { body: string; meta: Meta } {
  const source = text ?? "";
  const normalized = source.startsWith("---\n") ? `\n${source}` : source;
  const at = normalized.lastIndexOf("\n---\n");
  if (at < 0) return { body: source, meta: { ...EMPTY } };
  const lines = normalized.slice(at + 5).split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
  if (!lines.length || !lines.every((line) => LINE.test(line))) return { body: source, meta: { ...EMPTY } };
  const meta: Meta = { tags: [], links: [], kind: null, log: false };
  for (const line of lines) {
    const [, key, value = ""] = line.match(LINE)!;
    if (key === "Tags") meta.tags = normalizeTags(value);
    else if (key === "Link") meta.links.push(...normalizeLinks(value));
    else if (key === "Type") meta.kind = value.trim() === "internal" ? "internal" : value.trim() === "external" ? "external" : null;
    else if (key === "Logged") meta.log = value.trim() === "yes";
  }
  return { body: normalized.slice(0, at).replace(/^\n/, "").trimEnd(), meta };
}

export function composeMeta(body: string, meta: Partial<Meta>): string {
  const lines: string[] = [];
  const tags = normalizeTags(meta.tags ?? []);
  if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
  for (const link of normalizeLinks(meta.links ?? [])) lines.push(`Link: ${link}`);
  if (meta.kind) lines.push(`Type: ${meta.kind}`);
  if (meta.log) lines.push("Logged: yes");
  const clean = body.trimEnd();
  return lines.length ? `${clean}${clean ? "\n" : ""}---\n${lines.join("\n")}` : clean;
}

/** Same-company organizer = internal; a client's domain or any outside domain = external. */
export function classifyMeeting(organizerEmail: string, ownEmail: string, clientDomainMatch: boolean): MeetingKind {
  if (clientDomainMatch) return "external";
  const own = ownEmail.split("@")[1]?.toLowerCase();
  const theirs = organizerEmail.split("@")[1]?.toLowerCase();
  return own && theirs && own === theirs ? "internal" : theirs ? "external" : "internal";
}

/** Pulls web links (for example a Teams join link) out of free text. */
export function extractLinks(text: string): string[] {
  return normalizeLinks((text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []).map((link) => link.replace(/[.,;]+$/, "")));
}
