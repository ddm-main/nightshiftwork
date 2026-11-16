import { createFileRoute } from "@tanstack/react-router";
import { validateCalendarUrl } from "@/lib/calendar-url";

const MAX_CHARS = 3_000_000;

const reply = (status: number, body: string, type = "text/plain; charset=utf-8") =>
  new Response(body, { status, headers: { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" } });

// Read-only proxy for a published Outlook calendar (.ics). Browsers cannot fetch it directly because Outlook sends no CORS headers.
export const Route = createFileRoute("/api/calendar")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        let target = validateCalendarUrl(new URL(request.url).searchParams.get("url") ?? "");
        if (!target) return reply(400, "Only published Outlook calendar links are supported.");
        try {
          for (let hop = 0; hop < 4; hop += 1) {
            const upstream = await fetch(target, { redirect: "manual", headers: { accept: "text/calendar, text/plain;q=0.8" }, signal: AbortSignal.timeout(15_000) });
            if (upstream.status >= 300 && upstream.status < 400) {
              const next = validateCalendarUrl(new URL(upstream.headers.get("location") ?? "", target).toString());
              if (!next) return reply(502, "The calendar link redirected somewhere that is not allowed.");
              target = next;
              continue;
            }
            if (!upstream.ok) return reply(upstream.status === 404 ? 404 : 502, `Outlook returned ${upstream.status}. Check that the link is still published.`);
            const text = await upstream.text();
            if (text.length > MAX_CHARS) return reply(413, "That calendar is too large.");
            if (!text.includes("BEGIN:VCALENDAR")) return reply(502, "That link did not return a calendar file.");
            return reply(200, text, "text/calendar; charset=utf-8");
          }
          return reply(502, "Too many redirects.");
        } catch {
          return reply(504, "Could not reach Outlook. Try again in a moment.");
        }
      },
    },
  },
});
