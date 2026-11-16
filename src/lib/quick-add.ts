import type { PlanBucket, Project, TaskPriority } from "@/lib/tracker-types";

export type ParsedQuickTask = {
  title: string;
  bucket: PlanBucket;
  priority: TaskPriority;
  projectId: string | null;
  steps: string[];
};

// Horizon words only count at the very start or end of the text, so "Check today's report" keeps its title.
const BUCKET_WORDS: Array<[string, PlanBucket]> = [
  ["tonight", "tonight"], ["today", "tonight"], ["tomorrow", "tomorrow"],
  ["next week", "next_7_days"], ["this week", "next_7_days"], ["next 7 days", "next_7_days"],
  ["next month", "next_30_days"], ["next 30 days", "next_30_days"], ["backlog", "backlog"], ["someday", "backlog"],
];

const PRIORITY_WORDS: Array<[RegExp, TaskPriority]> = [
  [/(^|\s)(!high|!urgent|!!)(?=\s|$)/i, "high"],
  [/(^|\s)(!low)(?=\s|$)/i, "low"],
];

/**
 * Parses a one-line task like:
 *   "Review launch page tomorrow #acme !high : check copy; confirm links"
 * Words for the planning horizon, !high / !low, #project and "steps after a colon,
 * separated by semicolons" are consumed; the rest becomes the title.
 */
export function parseQuickTask(input: string, projects: Project[], fallbackBucket: PlanBucket = "tonight"): ParsedQuickTask {
  let text = input.trim();
  let steps: string[] = [];
  const colon = text.indexOf(":");
  if (colon > 0) {
    steps = text.slice(colon + 1).split(/[;\n]/).map((step) => step.trim()).filter(Boolean);
    text = text.slice(0, colon).trim();
  }

  let priority: TaskPriority = "normal";
  for (const [pattern, value] of PRIORITY_WORDS) {
    if (pattern.test(text)) { priority = value; text = text.replace(pattern, " "); }
  }

  let projectId: string | null = null;
  const tag = text.match(/(^|\s)#([\w-]+)/);
  if (tag) {
    const wanted = (tag[2] ?? "").toLowerCase();
    const match = projects.find((project) => project.name.toLowerCase().replace(/\s+/g, "-").startsWith(wanted));
    if (match) { projectId = match.id; text = text.replace(tag[0], " "); }
  }

  let bucket: PlanBucket = fallbackBucket;
  const trimmed = text.replace(/\s+/g, " ").trim();
  for (const [word, value] of BUCKET_WORDS) {
    const lower = trimmed.toLowerCase();
    if (lower.endsWith(` ${word}`) && !lower.endsWith(`'s ${word}`)) { bucket = value; text = trimmed.slice(0, trimmed.length - word.length); break; }
    if (lower.startsWith(`${word} `)) { bucket = value; text = trimmed.slice(word.length); break; }
  }

  const title = text.replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
  return { title, bucket, priority, projectId, steps };
}
