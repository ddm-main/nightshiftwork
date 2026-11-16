import { useState } from "react";
import { Calendar, Check, Copy, ExternalLink, LogOut, Mail, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui-kit";
import { validateCalendarUrl } from "@/lib/calendar-url";

const PORTAL = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/isMSAApp~/false";

export function OutlookDialog({ icsUrl, onIcsUrl, onSaveIcs, onRemoveIcs, onImportEml, clientId, onClientId, account, connected, redirectUris, syncing, lastSync, onConnect, onDisconnect, onSync, onClose }: {
  icsUrl: string; onIcsUrl: (url: string) => void; onSaveIcs: () => void; onRemoveIcs: () => void; onImportEml: (files: File[]) => void;
  clientId: string; onClientId: (id: string) => void; account: string | null; connected: boolean; redirectUris: string[];
  syncing: boolean; lastSync: Date | null; onConnect: () => void; onDisconnect: () => void; onSync: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState("");
  const copy = (value: string) => { void navigator.clipboard.writeText(value).then(() => { setCopied(value); toast.success("Copied"); window.setTimeout(() => setCopied(""), 1500); }); };
  const linkOk = Boolean(validateCalendarUrl(icsUrl));
  const linked = linkOk && icsUrl.trim().length > 0;

  return <ModalShell title="Outlook" onClose={onClose} className="outlook">
    <div className="outlook-body">
      <p className="field-helper readonly-note">Read-only: nothing here can send, delete, move or change anything in Outlook.</p>

      <section className="pref-group">
        <h3><Calendar size={13} /> Calendar — publish link (no admin access needed)</h3>
        <ol className="setup-steps">
          <li>Open <a href="https://outlook.office.com/calendar" target="_blank" rel="noreferrer">Outlook on the web <ExternalLink size={11} /></a> and sign in as usual.</li>
          <li>Click the gear icon → <em>Calendar</em> → <em>Shared calendars</em> → <em>Publish a calendar</em>.</li>
          <li>Pick your calendar, set <em>Can view all details</em>, click <em>Publish</em>, then copy the <em>ICS</em> link.</li>
          <li>Paste it here. Your meetings (including recurring ones) sync every 15 minutes.</li>
        </ol>
        <Input aria-label="Published calendar link" value={icsUrl} onChange={(event) => onIcsUrl(event.target.value)} placeholder="https://outlook.office365.com/owa/calendar/…/reachcalendar.ics" spellCheck={false} />
        {icsUrl.trim() && !linkOk ? <p className="field-helper warn-note">That does not look like an Outlook calendar link (it should start with https://outlook.office365.com or outlook.live.com).</p> : null}
        <div className="outlook-actions">
          <Button onClick={onSaveIcs} disabled={!linkOk || syncing}><RefreshCw size={14} className={syncing ? "spin" : ""} /> {linked ? "Save & sync" : "Save link"}</Button>
          {linked ? <Button variant="ghost" className="danger-ghost" onClick={onRemoveIcs}>Remove link</Button> : null}
          <span className="field-helper">{lastSync ? `Last sync ${new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(lastSync)}` : ""}</span>
        </div>
        <p className="field-helper">If “Publish a calendar” is missing, your organisation has turned it off — use the .ics import on the Meetings page instead. The link is private to you; treat it like a password.</p>
      </section>

      <section className="pref-group">
        <h3><Mail size={13} /> Email — import saved messages</h3>
        <p className="field-helper">In Outlook on the web, drag a message to your desktop (it saves as <em>.eml</em>), then import it here. Client mail becomes a suggested task, matched to a project by sender domain.</p>
        <label className="outlook-upload"><Upload size={14} /> Import emails (.eml)<input type="file" accept=".eml,message/rfc822" multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onImportEml(files); event.target.value = ""; }} /></label>
      </section>

      <details className="pref-group advanced">
        <summary>Advanced: Microsoft sign-in (needs an app registration)</summary>
        {connected ? <>
          <div className="outlook-status on"><Mail size={16} /><div><strong>Connected</strong><small>{account ?? "Microsoft account"}</small></div></div>
          <div className="outlook-actions"><Button onClick={onSync} disabled={syncing}><RefreshCw size={14} className={syncing ? "spin" : ""} /> Sync now</Button><Button variant="ghost" className="danger-ghost" onClick={onDisconnect}><LogOut size={14} /> Disconnect</Button></div>
        </> : <>
          <p className="field-helper">Only if you or your IT team can register an app. It reads live mail and calendar with read-only permissions (<em>User.Read, Calendars.Read, Mail.Read</em> — never add ReadWrite or Send).</p>
          <ol className="setup-steps">
            <li>Create the app at <a href={PORTAL} target="_blank" rel="noreferrer">Microsoft Entra <ExternalLink size={11} /></a> (any organizational directory and personal accounts).</li>
            <li>Add these as <em>Single-page application</em> redirect URIs — one for local development and one for the published site:
              {redirectUris.map((uri) => <div className="copy-row" key={uri}><code>{uri}</code><Button type="button" size="sm" variant="outline" onClick={() => copy(uri)}>{copied === uri ? <Check size={13} /> : <Copy size={13} />}</Button></div>)}
            </li>
            <li>Paste the Application (client) ID below.</li>
          </ol>
          <Input id="ms-client" aria-label="Application (client) ID" value={clientId} onChange={(event) => onClientId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" spellCheck={false} />
          <Button onClick={onConnect} disabled={!/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(clientId.trim())}><Mail size={14} /> Sign in with Microsoft</Button>
        </>}
      </details>
      <p className="field-helper">Settings are saved per address, so set this up once on <em>localhost:8080</em> and once on <em>nightshiftwork.lovable.app</em>.</p>
    </div>
  </ModalShell>;
}
