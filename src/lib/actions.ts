/** Pulls likely action items out of pasted meeting notes or an email body. */
export function extractActionItems(text: string): string[] {
  const items: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:[-*•]|\d+[.)]|\[\s?\])\s+(.*)$/);
    const labelled = line.match(/^(?:action(?: item)?s?|todo|to-do|ai|next step)\s*[:\-]\s*(.*)$/i);
    const body = (labelled?.[1] ?? bullet?.[1] ?? "").replace(/^\[\s?[xX ]?\]\s*/, "").trim();
    if (body.length > 2) items.push(body);
  }
  return [...new Set(items)];
}
