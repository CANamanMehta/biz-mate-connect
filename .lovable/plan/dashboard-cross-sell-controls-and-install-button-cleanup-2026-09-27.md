# Dashboard cross-sell controls and install button cleanup

## Changes
- Keep the existing cross-sell **Dismiss** action and make it clearly available on every Dashboard idea.
- Add a **Snooze** menu with practical return dates (tomorrow, one week, one month). Snoozed ideas disappear immediately and return automatically after the selected date.
- Store the snooze date in the database and update it through an authenticated, access-checked database function. Dismissed ideas keep the existing required reason and 180-day behavior.
- Remove only the signed-in top-right **Install App** button; retain the sidebar install button and the login-page install button.

## Verification
- Confirm snoozing removes an idea, dismissed ideas remain hidden, and the list refreshes after each action.
- Confirm the signed-in header has no Install App button while the sidebar still has one.
- Check the build and the relevant Dashboard layout at desktop and mobile widths.

## Technical details
- Add a nullable `snoozed_until` date to `cross_sell_suggestions` with an authenticated RPC that validates the caller can access the suggestion.
- Filter Dashboard suggestions to rows with no snooze date or a date on/before today.
