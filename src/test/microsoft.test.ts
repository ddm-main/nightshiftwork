import { describe, expect, it } from "vitest";
import { domainMatches, eventToMeeting, triageEmails, type GraphMessage } from "@/lib/microsoft";
import type { Project } from "@/lib/tracker-types";

const projects = [{ id: "p1", name: "Apollo", domain_rules: ["@clientcorp.com"], archived_at: null }] as unknown as Project[];
const mail = (over: Partial<GraphMessage> & { email: string }): GraphMessage => ({ id: over.id ?? over.email, subject: over.subject ?? "Hello", receivedDateTime: "2026-11-16T10:00:00Z", bodyPreview: over.bodyPreview ?? "", importance: over.importance ?? "normal", inferenceClassification: over.inferenceClassification ?? "focused", from: { emailAddress: { address: over.email, name: "Sender" } } });

describe("Outlook triage", () => {
  it("matches sender domains to project rules, including subdomains", () => {
    expect(domainMatches("sarah@clientcorp.com", ["@clientcorp.com"])).toBe(true);
    expect(domainMatches("ops@eu.clientcorp.com", ["clientcorp.com"])).toBe(true);
    expect(domainMatches("x@other.com", ["clientcorp.com"])).toBe(false);
  });
  it("drops noise and keeps actionable client mail with the right project and priority", () => {
    const result = triageEmails([
      mail({ email: "noreply@shop.com", subject: "Your order shipped" }),
      mail({ email: "news@brand.com", subject: "Weekly newsletter" }),
      mail({ email: "random@gmail.com", subject: "Lunch", bodyPreview: "see you" }),
      mail({ email: "sarah@clientcorp.com", subject: "Login is failing — urgent", bodyPreview: "Can you look tonight?" }),
      mail({ email: "dev@partner.io", subject: "Can you review the PR?", bodyPreview: "please" }),
    ], projects);
    expect(result.map((item) => item.senderEmail)).toEqual(["sarah@clientcorp.com", "dev@partner.io"]);
    expect(result[0]).toMatchObject({ projectId: "p1", priority: "high" });
    expect(result[1]).toMatchObject({ projectId: null, priority: "normal" });
  });
});

describe("eventToMeeting", () => {
  it("treats Graph UTC date-times as UTC and keeps the join link", () => {
    const meeting = eventToMeeting({ id: "e1", subject: "Sync", start: { dateTime: "2026-11-16T16:30:00.0000000" }, end: { dateTime: "2026-11-16T17:00:00.0000000" }, bodyPreview: "Agenda", onlineMeeting: { joinUrl: "https://teams/x" }, organizer: { emailAddress: { address: "Boss@ClientCorp.com" } } });
    expect(meeting).toMatchObject({ startsAt: "2026-11-16T16:30:00.000Z", endsAt: "2026-11-16T17:00:00.000Z", organizerEmail: "boss@clientcorp.com" });
    expect(meeting.description).toContain("Join: https://teams/x");
  });
});

import { MS_SCOPES } from "@/lib/microsoft";
import { readFileSync } from "node:fs";

describe("Outlook access stays read-only", () => {
  it("requests no write, send or manage permissions", () => {
    const scopes = MS_SCOPES.split(" ");
    expect(scopes).toEqual(expect.arrayContaining(["Calendars.Read", "Mail.Read", "User.Read"]));
    for (const scope of scopes) expect(scope).not.toMatch(/write|send|manage|shared|full_access|\.all$/i);
  });
  it("only ever issues GET requests to Microsoft Graph", () => {
    const source = readFileSync("src/lib/microsoft.ts", "utf8");
    expect(source).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"[^}]*graph\.microsoft/i);
    const graphCalls = source.split("\n").filter((line) => line.includes("${GRAPH}"));
    expect(graphCalls.length).toBeGreaterThan(0);
    for (const line of graphCalls) expect(line).toContain('method: "GET"');
  });
});
