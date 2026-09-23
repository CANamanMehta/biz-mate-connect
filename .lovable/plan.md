# AOM CRM app shell and core records

## Goal
Turn the authenticated workspace into the daily-use CRM shell, with fast enquiry capture, searchable records, organisation 360° views, and admin configuration. Dashboard, Pipeline, Meetings, Tasks, and Reports remain intentional placeholders.

## App shell
- Replace the current signed-in page wrapper with a shared AOM shell.
- Desktop: fixed left navigation in the requested order, compact top search, signed-in partner menu, and sign-out.
- Mobile: persistent bottom navigation for primary destinations, an overflow menu for the remaining destinations, and safe-area spacing.
- Show Admin only when the signed-in user has the secure admin role.
- Keep a prominent floating **+ New Enquiry** action on every signed-in page.
- Preserve navy/orange branding, dense tables on desktop, concise record cards on mobile, accessible focus states, and responsive text/layout.

## Fast enquiry capture
- Open New Enquiry as a focused drawer/dialog from any page, optimized for keyboard and mobile entry.
- Keep only these fields immediately visible: organisation, contact name, phone, email, acquisition source, service lines, and owner (preselected to the current partner).
- Put fee, close date, urgency, industry, city, referral contact, acquired-by partner, and notes under **More details**.
- Auto-select the managing partner for `managing_partner` and the owner for `partner_self`.
- Add normalized duplicate matching that ignores punctuation and legal suffixes such as Pvt, Ltd, Private, Limited, and LLP.
- Present possible matches with relationship owner and visible open pursuit stage; warn when another partner is already pursuing the account. Let the user reuse the organisation or explicitly continue with a new one.
- Save organisation/contact/opportunity/service-line links/activity history as one database transaction. New opportunities start at enquiry, open, 10% probability, and today’s last-activity date.

## Core record pages
- **Enquiries:** newest-first enquiry list with owner, organisation, service lines, value, and quick actions. Qualify moves to Qualified Lead at 30%; Disqualify requires a one-line reason and records history.
- **Organisations:** searchable/filterable desktop table and mobile cards. Include name, city, status, relationship owner, open opportunity count, last activity, plus status/branch/industry filters and restricted-pursuit notices.
- **Organisation detail:** header plus Overview, Contacts, Opportunities, Meetings, Tasks, and History tabs. Overview includes all active service lines as engaged navy, pitched orange outline, or not-yet-offered grey chips.
- **Contacts:** searchable list with organisation, phone/email, and Decision maker / Referrer badges. Add and edit contacts inline from the organisation detail page.
- **Admin:** admin-only partner management (invite, branch, secure role, active status), service-line management, and branch management.
- **Placeholders:** create routed pages for Dashboard, Pipeline, Meetings, Tasks, and Reports so every navigation item works now.

## Data and access
- Add an opportunity urgency field with Low, Medium, and High choices.
- Add authenticated database functions for normalized duplicate search, global search, transactional enquiry creation, and enquiry stage actions where atomic updates/history are required.
- Keep all reads and writes under the existing row-level permissions, including restricted-opportunity filtering and admin-only configuration.
- Keep secure roles in `user_roles`, never in partner profile rows or browser storage.
- Add indexes needed for common list, filter, and recent-activity queries.

## Implementation structure
- Add reusable signed-in shell, search, page header, loading/empty/error states, enquiry form, record badges, and responsive table/card components.
- Add authenticated server functions and TanStack Query options for reads/mutations; invalidate affected organisation, contact, opportunity, and activity queries after writes.
- Add separate route files for every navigation destination and organisation detail page, each with unique metadata.
- Refresh generated backend types after the migration.

## Verification
- Verify regular-partner and admin navigation visibility.
- Verify enquiry creation with a new organisation and with an existing organisation, including source auto-selection and duplicate warnings.
- Verify qualify/disqualify actions and history entries.
- Verify organisation filters, detail tabs, contact add/edit, service chips, global search, admin edits/invites, and restricted pursuit behavior.
- Check desktop and mobile layouts for clipping, overlap, touch reachability, and bottom-bar/floating-action spacing.
