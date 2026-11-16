import { useState } from "react";
import { Check, Copy, ExternalLink, LogOut, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui-kit";

const PORTAL = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/isMSAApp~/false";

export function OutlookDialog({ clientId, onClientId, account, connected, redirectUri, syncing, lastSync, onConnect, onDisconnect, onSync, onClose }: {
  clientId: string; onClientId: (id: string) => void; account: string | null; connected: boolean; redirectUri: string;
  syncing: boolean; lastSync: Date | null; onConnect: () => void; onDisconnect: () => void; onSync: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard.writeText(redirectUri).then(() => { setCopied(true); toast.success("Redirect URI copied"); window.setTimeout(() => setCopied(false), 1500); }); };

  return <ModalShell title="Outlook" onClose={onClose} className="outlook">
    <div className="outlook-body">
      <div className={`outlook-status${connected ? " on" : ""}`}><Mail size={16} /><div><strong>{connected ? "Connected" : "Not connected"}</strong><small>{connected ? (account ?? "Microsoft account") : "Sign in to sync meetings and get task suggestions from client email."}</small></div></div>

      {connected ? <>
        <p className="field-helper readonly-note">Read-only access: this app can read your calendar and email but cannot send, delete, move or change anything in Outlook.</p>
        <p className="field-helper">Your calendar for the next 14 days is added to Meetings, and unread-today client email becomes suggested tasks on the Dashboard. Access is read-only and the sign-in stays in this browser.</p>
        <div className="outlook-actions">
          <Button onClick={onSync} disabled={syncing}><RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}</Button>
          <span className="field-helper">{lastSync ? `Last sync ${new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(lastSync)}` : "Not synced yet"}</span>
          <Button variant="ghost" className="danger-ghost" onClick={onDisconnect}><LogOut size={14} /> Disconnect</Button>
        </div>
      </> : <>
        <ol className="setup-steps">
          <li>Open the <a href={PORTAL} target="_blank" rel="noreferrer">Microsoft Entra app registration page <ExternalLink size={11} /></a> and sign in with your Outlook account.</li>
          <li>Name it <em>Nightshift</em>. For account types choose <em>any organizational directory and personal Microsoft accounts</em>.</li>
          <li>Under Redirect URI pick <em>Single-page application (SPA)</em> and paste this exact address:
            <div className="copy-row"><code>{redirectUri}</code><Button type="button" size="sm" variant="outline" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</Button></div>
          </li>
          <li>After it is created, open <em>API permissions → Add → Microsoft Graph → Delegated</em> and add only these three read-only permissions: <em>User.Read, Calendars.Read, Mail.Read</em>. Do not add any “ReadWrite” or “Send” permission.</li>
          <li>Copy the <em>Application (client) ID</em> from the Overview page and paste it below.</li>
        </ol>
        <label className="field-label" htmlFor="ms-client">Application (client) ID</label>
        <Input id="ms-client" value={clientId} onChange={(event) => onClientId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" spellCheck={false} />
        <Button onClick={onConnect} disabled={!/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(clientId.trim())}><Mail size={14} /> Sign in with Microsoft</Button>
        <p className="field-helper">No client secret is needed. If your company blocks self-service apps, Microsoft will show “admin approval required” — in that case ask IT to approve it, or keep using the .ics import and Paste notes.</p>
      </>}
    </div>
  </ModalShell>;
}
