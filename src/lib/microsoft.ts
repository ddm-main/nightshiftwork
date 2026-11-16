import type { Project, TaskPriority } from "@/lib/tracker-types";

// Delegated (signed-in user) Microsoft Graph access using the OAuth 2.0 authorization-code flow with PKCE.
// This needs only a public Client ID (an Entra "Single-page application" registration) — no client secret.
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
// READ-ONLY by design: never add ReadWrite, Send, Manage or *.Shared scopes. A test enforces this.
export const MS_SCOPES = "openid profile offline_access User.Read Calendars.Read Mail.Read";

const CLIENT_KEY = "ns-ms-client";
const TOKEN_KEY = "ns-ms-token";
const PKCE_KEY = "ns-ms-pkce";

export type MsTokens = { access_token: string; refresh_token?: string; expires_at: number; account?: string };

const read = <T,>(storage: Storage, key: string): T | null => { try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; } };
const write = (storage: Storage, key: string, value: unknown) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export const getClientId = () => { try { return localStorage.getItem(CLIENT_KEY) ?? ""; } catch { return ""; } };
export const setClientId = (id: string) => { try { localStorage.setItem(CLIENT_KEY, id.trim()); } catch { /* ignore */ } };
export const getTokens = () => read<MsTokens>(localStorage, TOKEN_KEY);
export const isConnected = () => Boolean(getTokens());
export const signOutMicrosoft = () => { try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(PKCE_KEY); } catch { /* ignore */ } };

const base64url = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomString = (length = 48) => base64url(crypto.getRandomValues(new Uint8Array(length)));

export async function startLogin(clientId: string, redirectUri: string): Promise<void> {
  const verifier = randomString(64);
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  write(sessionStorage, PKCE_KEY, { verifier, state, redirectUri });
  const params = new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: MS_SCOPES, code_challenge: challenge, code_challenge_method: "S256", state, prompt: "select_account" });
  window.location.assign(`${AUTH}/authorize?${params.toString()}`);
}

async function tokenRequest(body: Record<string, string>): Promise<MsTokens> {
  const response = await fetch(`${AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const json = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error_description?: string };
  if (!response.ok || !json.access_token) throw new Error((json.error_description ?? "Microsoft sign-in failed").split("\r\n")[0]);
  let account: string | undefined;
  try { account = (JSON.parse(atob((json.id_token ?? "").split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { preferred_username?: string }).preferred_username; } catch { /* no id token */ }
  return { access_token: json.access_token, ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}), expires_at: Date.now() + (json.expires_in ?? 3600) * 1000, ...(account ? { account } : {}) };
}

/** Finishes the redirect: exchanges ?code for tokens. Returns null when the URL is not a sign-in response. */
export async function completeLogin(clientId: string, query: URLSearchParams): Promise<MsTokens | null> {
  if (query.get("error")) throw new Error(query.get("error_description")?.split("\r\n")[0] ?? "Microsoft sign-in was cancelled.");
  const code = query.get("code");
  const saved = read<{ verifier: string; state: string; redirectUri: string }>(sessionStorage, PKCE_KEY);
  if (!code || !saved) return null;
  if (query.get("state") !== saved.state) throw new Error("Sign-in response did not match this browser session. Please try again.");
  const tokens = await tokenRequest({ client_id: clientId, grant_type: "authorization_code", code, redirect_uri: saved.redirectUri, code_verifier: saved.verifier, scope: MS_SCOPES });
  write(localStorage, TOKEN_KEY, tokens);
  try { sessionStorage.removeItem(PKCE_KEY); } catch { /* ignore */ }
  return tokens;
}

export async function getAccessToken(clientId: string): Promise<string> {
  const tokens = getTokens();
  if (!tokens) throw new Error("Outlook is not connected.");
  if (tokens.expires_at > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) { signOutMicrosoft(); throw new Error("Your Outlook session expired. Please sign in again."); }
  try {
    const next = await tokenRequest({ client_id: clientId, grant_type: "refresh_token", refresh_token: tokens.refresh_token, scope: MS_SCOPES });
    const merged = { ...next, refresh_token: next.refresh_token ?? tokens.refresh_token, account: next.account ?? tokens.account } as MsTokens;
    write(localStorage, TOKEN_KEY, merged);
    return merged.access_token;
  } catch {
    signOutMicrosoft();
    throw new Error("Your Outlook session expired. Please sign in again.");
  }
}

/** Every Graph call is a GET: this app can read mail and calendar but has no code path that changes them. */
async function graph<T>(clientId: string, path: string, headers: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken(clientId);
  const response = await fetch(`${GRAPH}${path}`, { method: "GET", headers: { Authorization: `Bearer ${token}`, ...headers } });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(detail.error?.message ?? `Microsoft Graph returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type GraphEvent = { id: string; subject: string | null; start: { dateTime: string }; end: { dateTime: string }; bodyPreview?: string; isCancelled?: boolean; organizer?: { emailAddress?: { address?: string; name?: string } }; attendees?: Array<{ emailAddress?: { address?: string } }>; onlineMeeting?: { joinUrl?: string } | null };
export type GraphMessage = { id: string; subject: string | null; receivedDateTime: string; bodyPreview?: string; importance?: string; inferenceClassification?: string; from?: { emailAddress?: { address?: string; name?: string } } };

export async function fetchCalendar(clientId: string, from: Date, to: Date): Promise<GraphEvent[]> {
  const query = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "100", $orderby: "start/dateTime", $select: "id,subject,start,end,bodyPreview,isCancelled,organizer,attendees,onlineMeeting" });
  const result = await graph<{ value: GraphEvent[] }>(clientId, `/me/calendarView?${query.toString()}`, { Prefer: 'outlook.timezone="UTC"' });
  return result.value.filter((event) => !event.isCancelled);
}

export async function fetchInbox(clientId: string, since: Date): Promise<GraphMessage[]> {
  const query = new URLSearchParams({ $filter: `receivedDateTime ge ${since.toISOString()}`, $orderby: "receivedDateTime desc", $top: "50", $select: "id,subject,receivedDateTime,bodyPreview,importance,inferenceClassification,from" });
  const result = await graph<{ value: GraphMessage[] }>(clientId, `/me/mailFolders/inbox/messages?${query.toString()}`);
  return result.value;
}

const asUtc = (value: string) => new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value.split(".")[0]}Z`).toISOString();

export function eventToMeeting(event: GraphEvent): { outlookId: string; title: string; startsAt: string; endsAt: string; description: string; organizerEmail: string; joinUrl: string | null } {
  return {
    outlookId: event.id,
    title: (event.subject ?? "").trim() || "(No subject)",
    startsAt: asUtc(event.start.dateTime),
    endsAt: asUtc(event.end.dateTime),
    description: [event.bodyPreview?.trim(), event.onlineMeeting?.joinUrl ? `Join: ${event.onlineMeeting.joinUrl}` : ""].filter(Boolean).join("\n"),
    organizerEmail: event.organizer?.emailAddress?.address?.toLowerCase() ?? "",
    joinUrl: event.onlineMeeting?.joinUrl ?? null,
  };
}

export type EmailProposal = { id: string; subject: string; senderName: string; senderEmail: string; excerpt: string; receivedAt: string; projectId: string | null; priority: TaskPriority };

const NOISE_SENDER = /(no-?reply|do-?not-?reply|notifications?@|newsletter|mailer-daemon|marketing|alerts?@|bounce|updates?@)/i;
const NOISE_SUBJECT = /(unsubscribe|newsletter|receipt|your order|invoice\s*#|out of office|automatic reply|webinar|promotion|% off)/i;
const ACTIONABLE = /(\?|please|can you|could you|need|urgent|asap|issue|bug|error|failed|failing|outage|request|review|approve|deadline|by eod|by tomorrow|action required)/i;
const URGENT = /(urgent|asap|critical|outage|down\b|p1|sev ?1|immediately)/i;

export function domainMatches(email: string, rules: string[]): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return rules.some((rule) => { const clean = rule.replace(/^@/, "").trim().toLowerCase(); return Boolean(clean) && (domain === clean || domain.endsWith(`.${clean}`)); });
}

export function triageEmails(messages: GraphMessage[], projects: Project[]): EmailProposal[] {
  const proposals: EmailProposal[] = [];
  for (const message of messages) {
    const email = message.from?.emailAddress?.address?.toLowerCase() ?? "";
    const subject = (message.subject ?? "").trim();
    const text = `${subject} ${message.bodyPreview ?? ""}`;
    if (!email || !subject) continue;
    const project = projects.find((item) => !item.archived_at && domainMatches(email, item.domain_rules));
    if (NOISE_SENDER.test(email) || NOISE_SUBJECT.test(subject)) continue;
    if (message.inferenceClassification === "other" && !project) continue;
    if (!project && !ACTIONABLE.test(text)) continue;
    const priority: TaskPriority = message.importance === "high" || URGENT.test(text) ? "high" : /(fyi|whenever|no rush)/i.test(text) ? "low" : "normal";
    proposals.push({ id: message.id, subject, senderName: message.from?.emailAddress?.name ?? email, senderEmail: email, excerpt: (message.bodyPreview ?? "").replace(/\s+/g, " ").trim().slice(0, 220), receivedAt: message.receivedDateTime, projectId: project?.id ?? null, priority });
  }
  return proposals;
}
