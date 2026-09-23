# AOM CRM implementation plan

## Goal
Build a polished, secure CRM for business development teams, with a fast operational layout and persistent shared data.

## Experience
- Use the selected Operational Modern direction: warm-white surfaces, charcoal typography, coral actions, subtle cool-gray dividers, Space Grotesk headings, and DM Sans body text.
- Create a responsive sidebar workspace with Dashboard, Pipeline, Companies, Contacts, Tasks, Reports, and Team areas.
- Keep the interface dense and scannable for daily sales work, with clear empty, loading, error, and success states.

## Core workflows
- Dashboard: pipeline value, weighted forecast, win rate, open opportunities, upcoming tasks, and recent activity.
- Pipeline: drag-free stage board with reliable stage-change controls; defaults to Lead, Qualified, Proposal, Negotiation, Won, and Lost.
- Opportunities: create, inspect, edit, assign ownership, set value/probability/close date, and link companies and contacts.
- Companies and contacts: searchable lists, detail views, relationship data, and linked opportunities.
- Tasks: create follow-ups, calls, meetings, and deadlines; mark complete and filter by owner/status.
- Reports: stage distribution, forecast, outcomes, and activity summaries from live CRM data.
- Team administration: admins can review members and manage roles; regular members work only within allowed records.

## Access and security
- Add email/password and Google sign-in, password recovery, and session-aware sign-out.
- Store team profiles separately from secure role assignments.
- Protect every CRM page and every data operation; enforce access rules in the database, not only in the interface.
- Seed a realistic first workspace so the dashboard is useful immediately after sign-in.

## Data model
- Profiles and separate user roles.
- Companies and contacts.
- Opportunities with stage, value, probability, owner, company, primary contact, and expected close date.
- Tasks linked to opportunities, companies, or contacts.
- Activity records for auditable changes and recent-work feeds.
- Indexes for owner, stage, status, due date, and relationship lookups.

## Technical details
- Use Lovable Cloud for authentication and persistent relational data.
- Apply explicit database grants, row-level access policies, and server-validated admin role checks.
- Keep private reads and writes behind authenticated server functions.
- Use chart components for reports and reusable form/dialog primitives for record editing.
- Add route-specific page metadata and verify the signed-out and signed-in flows at desktop and mobile sizes.
