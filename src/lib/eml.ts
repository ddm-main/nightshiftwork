import type { GraphMessage } from "@/lib/microsoft";

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try { return new TextDecoder(charset.toLowerCase().replace(/^"|"$/g, "") || "utf-8").decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function fromQuotedPrintable(value: string): Uint8Array {
  const text = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) { bytes.push(parseInt(text.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(text.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(bytes);
}

/** Decodes RFC 2047 encoded words such as =?UTF-8?B?...?= in headers. */
export function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, data: string) => {
    try { return decodeBytes(enc.toUpperCase() === "B" ? fromBase64(data) : fromQuotedPrintable(data.replace(/_/g, " ")), charset); } catch { return data; }
  }).replace(/\?=\s+=\?/g, "").trim();
}

function splitMessage(raw: string): { headers: Record<string, string>; body: string } {
  const text = raw.replace(/^﻿/, "");
  const match = text.match(/\r?\n\r?\n/);
  const headText = match ? text.slice(0, match.index) : text;
  const body = match ? text.slice((match.index ?? 0) + match[0].length) : "";
  const headers: Record<string, string> = {};
  for (const line of headText.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) { const key = line.slice(0, idx).trim().toLowerCase(); if (!(key in headers)) headers[key] = line.slice(idx + 1).trim(); }
  }
  return { headers, body };
}

function decodeBody(body: string, headers: Record<string, string>): string {
  const encoding = (headers["content-transfer-encoding"] ?? "").toLowerCase();
  const charset = /charset="?([^";\s]+)"?/i.exec(headers["content-type"] ?? "")?.[1] ?? "utf-8";
  try {
    if (encoding === "base64") return decodeBytes(fromBase64(body), charset);
    if (encoding === "quoted-printable") return decodeBytes(fromQuotedPrintable(body), charset);
  } catch { /* fall through to raw text */ }
  return body;
}

const stripHtml = (html: string) => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

function extractText(raw: string): { plain: string; html: string } {
  const { headers, body } = splitMessage(raw);
  const type = (headers["content-type"] ?? "text/plain").toLowerCase();
  const boundary = /boundary="?([^";\s]+)"?/i.exec(headers["content-type"] ?? "")?.[1];
  if (type.startsWith("multipart/") && boundary) {
    let plain = ""; let html = "";
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith("--")) break;
      const found = extractText(part.replace(/^\r?\n/, ""));
      plain ||= found.plain; html ||= found.html;
    }
    return { plain, html };
  }
  if (type.startsWith("text/html")) return { plain: "", html: decodeBody(body, headers) };
  if (type.startsWith("text/plain")) return { plain: decodeBody(body, headers), html: "" };
  return { plain: "", html: "" };
}

export function parseEml(raw: string, fallbackId = ""): GraphMessage | null {
  const { headers } = splitMessage(raw);
  const subject = decodeHeader(headers["subject"] ?? "").trim();
  const from = decodeHeader(headers["from"] ?? "");
  const address = /<([^>]+)>/.exec(from)?.[1] ?? /([^\s<>"']+@[^\s<>"']+)/.exec(from)?.[1] ?? "";
  if (!subject || !address) return null;
  const name = from.replace(/<[^>]*>/, "").replace(/^["'\s]+|["'\s]+$/g, "") || address;
  const date = new Date(headers["date"] ?? "");
  const { plain, html } = extractText(raw);
  const priority = `${headers["importance"] ?? ""} ${headers["x-priority"] ?? ""}`.toLowerCase();
  const preview = (plain || stripHtml(html)).replace(/\s+/g, " ").trim().slice(0, 400);
  return {
    id: (headers["message-id"] ?? "").replace(/[<>]/g, "") || fallbackId || `${address}|${subject}|${headers["date"] ?? ""}`,
    subject, receivedDateTime: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    bodyPreview: preview, importance: /high|^1|^2| 1| 2/.test(priority) ? "high" : "normal",
    from: { emailAddress: { address: address.toLowerCase(), name } },
  };
}
