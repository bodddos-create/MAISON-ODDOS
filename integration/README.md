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

Local commit is prepared. Source upload and production release were blocked by automatic approval review, so no code has been pushed. The additive database migration `20261026132700_group_enquiries.sql` has been applied and verified; the empty table is inaccessible to anonymous and authenticated browser roles. Website integration is prepared but has not been published.
