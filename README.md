# WorkTracker

Build the Night-Shift Operations Tracker web application connected to my external Supabase database in the "Work Tracker" organization:
- Supabase Project URL: https://hacdihdoebzmtrmrvmhs.supabase.co (Project ref: hacdihdoebzmtrmrvmhs)

Key application requirements from our finalized plan:

1. Temporal Shift Engine (5:30 PM to 3:30 AM IST):
- Strictly locked to 5:30 PM to 3:30 AM IST (Asia/Kolkata), with zero pre-shift or post-shift buffer hours.
- Virtual workday container anchored to the start date across midnight (e.g., 1:30 AM Tuesday belongs to Monday's shift).
- Dual-timezone clocks for IST and client timezone (America/New_York EST/EDT).

2. Three Core Sections:
- Live Shift ("My Shift"): Dual live clocks, shift status timer, tonight's focus queue with sub-step checklists, 1-click passive task timers, inline screenshot pasting (Ctrl+V) with lightweight markup/redaction, tonight's synced meetings with 5-minute pre-meeting client dossiers and action item extraction, pre-shift suggestion drawer from email scan/rollovers, focus mode, and a 60-second shift wrap-up drawer (with Friday-to-Monday weekend skipping and 1-click Slack/Teams standup/client summary copy).
- Work Hub & Planner ("Projects & Planning"): Client projects directory with timezone and domain matching rules, reusable SOP workflow template builder, shift-aware future planner (Tomorrow, Next 7 Days, Next 30 Days, Backlog), and natural-language task quick-add.
- History & Search ("Archive & Audit"): Monthly shift calendar grid, daily shift replay view with frozen task/substep logs, attached screenshots, and meeting notes, plus global search across tasks, notes, and screenshot OCR text.

3. Supabase Database Schema & Storage:
- Connect to project hacdihdoebzmtrmrvmhs under the Work Tracker organization.
- Relational schema: shifts, projects, workflow_templates, tasks, task_steps, meetings, and shift_attachments.
- Separate private storage buckets: task-evidence, meeting-assets, and shift-reports.
- Row Level Security (RLS) policies per user.

4. Microsoft Outlook / Teams Integration:
- Standard user OAuth (Calendars.Read, Mail.Read) without requiring Azure portal admin or app registration.
- Ingests calendar meetings during the shift and scans incoming client emails to propose actionable tasks with 1-click client acknowledgment replies.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/46099c89-1994-4682-970d-73e156ec1636).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
