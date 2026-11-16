import { describe, expect, it } from "vitest";
import { decodeHeader, parseEml } from "@/lib/eml";
import { triageEmails } from "@/lib/microsoft";
import type { Project } from "@/lib/tracker-types";

const plain = ["Message-ID: <abc@mail>", "From: Sarah Lee <sarah@clientcorp.com>", "Subject: Login is failing - please check", "Date: Mon, 16 Nov 2026 09:00:00 -0500", "Importance: high", "Content-Type: text/plain; charset=utf-8", "", "Hi team,", "can you look at the login error tonight?"].join("\r\n");

describe("parseEml", () => {
  it("reads headers and body from a plain message", () => {
    expect(parseEml(plain)).toMatchObject({ id: "abc@mail", subject: "Login is failing - please check", importance: "high", receivedDateTime: "2026-11-16T14:00:00.000Z", from: { emailAddress: { address: "sarah@clientcorp.com", name: "Sarah Lee" } } });
    expect(parseEml(plain)?.bodyPreview).toContain("login error tonight");
  });
  it("decodes encoded subjects and multipart quoted-printable bodies", () => {
    const multi = ["From: =?UTF-8?B?Sm9zw6k=?= <jose@partner.io>", "Subject: =?UTF-8?Q?Caf=C3=A9_menu_review?=", "Date: Mon, 16 Nov 2026 10:00:00 +0000", 'Content-Type: multipart/alternative; boundary="b1"', "", "--b1", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "", "Please review the caf=C3=A9 doc=", " today.", "--b1", "Content-Type: text/html; charset=utf-8", "", "<p>ignored html</p>", "--b1--"].join("\r\n");
    const result = parseEml(multi);
    expect(result?.subject).toBe("Café menu review");
    expect(result?.from?.emailAddress?.name).toBe("José");
    expect(result?.bodyPreview).toBe("Please review the café doc today.");
    expect(decodeHeader("=?UTF-8?B?SGVsbG8=?=")).toBe("Hello");
  });
  it("falls back to HTML and rejects files that are not emails", () => {
    const html = ["From: a@b.com", "Subject: Report", "Content-Type: text/html", "", "<div>Need <b>numbers</b>&nbsp;by EOD</div>"].join("\n");
    expect(parseEml(html)?.bodyPreview).toBe("Need numbers by EOD");
    expect(parseEml("just some text")).toBeNull();
  });
  it("feeds the same triage as Outlook sync", () => {
    const project = [{ id: "p1", name: "Apollo", domain_rules: ["clientcorp.com"], archived_at: null }] as unknown as Project[];
    const message = parseEml(plain);
    expect(triageEmails(message ? [message] : [], project)[0]).toMatchObject({ projectId: "p1", priority: "high" });
  });
});
