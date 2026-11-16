# Night-Shift Operations Tracker

Build the tracker as the first screen at `/`, using a focused operations-console interface and the existing design system.

## Scope
- Create three working sections: My Shift, Projects & Planning, and Archive & Audit.
- Enforce the 5:30 PM–3:30 AM Asia/Kolkata shift, anchor overnight work to its starting date, and show live IST and America/New_York clocks.
- Support shift tasks with checklists, one-click elapsed timers, focus mode, meeting/task notes, pasteable evidence, and end-of-shift summary copying.
- Support projects, reusable workflow templates, planning horizons, task quick-add, and history/search.
- Save user-entered tracker data in the browser until the external database is linked.

## Dependencies and limits
- Do not enable a separate Lovable Cloud database: the request names the external Work Tracker database. The supplied URL and screenshots identify it, but the project still must be linked through Project Settings → General → External Supabase before authenticated database, schema, and private storage work can be built or verified.
- Do not implement Outlook/Teams credential-password login or claim calendar/mail sync. Microsoft data access requires an approved OAuth application; the user does not have registration/consent access. Keep meeting entry and task capture usable without that integration.
- Avoid presenting sample content as synced user data.

## Technical notes
- Keep the time-window and overnight workday calculations in a small testable domain utility; assert the exact shift boundary and cross-midnight ownership.
- Use the existing UI primitives and semantic CSS tokens. Add route-specific metadata to `/`.
- Record any new structural decision in the root `AGENTS.md` before completion.
