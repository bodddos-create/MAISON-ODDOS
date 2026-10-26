# Groupes & privatisation — Maison Oddos

Prepared for Pilotage and the Villa Valleyre / La Maison du Parc websites.

- Public route: `/groupes` (optional `restaurant=villa` or `restaurant=parc`, still editable by the visitor).
- Embedded route: `/groupes?embed=1&restaurant=…`.
- Staff route: `/demandes-groupes`, also linked from Pilotage.
- Notification recipients are fixed on the server; visitor input cannot choose an email destination.
- Storage is server-only, with RLS and browser grants revoked. The API validates the authenticated user's profile and establishment before returning staff records.
- A saved record remains in Pilotage when the notification fails; staff can retry. Email status means provider acceptance, not confirmed inbox delivery.
- Existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY` and optional `RESERVATION_FROM` are reused. No secret is embedded in the frontend.
- Test requests should be marked `TEST — IGNORER` and use the restaurant's own contact details; do not use a customer's real details.

## Website integration

After the approved Pilotage deployment is READY and an end-to-end email test succeeds, append `groupes-privatisation.html` to the Villa homepage and prestations source and add it as a Webador body-end snippet on La Maison du Parc. The snippet opens a native modal and an iframe to the public form. It only accepts close messages from the exact Pilotage origin and the embedded frame.

## Verification

`node --test tests/group-enquiries.test.mjs` and `npm run build`.
UI QA: required-field errors, two-step progression, restaurant-specific recap and contact links, Back retains values, no newsletter consent inferred. Actual email delivery must be verified after deployment.

## Release state

Published with explicit owner approval on 26 October 2026. The additive database migration `20261026132700_group_enquiries.sql` is applied. Anonymous and authenticated browser roles cannot directly read the table.

Two end-to-end requests were submitted using the restaurants’ own business contact details. Both were stored successfully and both notifications were accepted by Resend. Inbox delivery was not independently verified. These clearly marked technical test requests were then classified as closed, without deletion.

The modal is active on Villa Valleyre home and prestations, and La Maison du Parc home, prestations and menus. A native-dialog close button and the embedded form’s Retour button return to the website. The WordPress homepage title remains Villa Valleyre.

The desktop Menu tab is doubled (94 px wide, about 193 px tall on Villa home, 180 px elsewhere). Reservation and social icons are adjacent at the top right. These size and header overrides are limited to desktop widths above 760 px. The Villa prestations header also includes the authentic linked Facebook/Instagram icons copied from the Villa homepage.

Staff access was verified to require login; real signed-in staff data access has not been browser-tested in this session. The protected API scopes restaurant staff to their own establishment.
