# Website visits

Protected staff page `/visites-sites`, linked from the Pilotage home navigation. Server validates Supabase users and profiles. Management sees both restaurants, restaurant profiles only their own establishment. Public intake only accepts the four exact restaurant origins, validates random v4 UUIDs and explicit consent, rejects known bot UAs and oversized input. Origin and UUID checks do not make client analytics tamper-proof. A transaction counts each event once and caps a session at 200 events per Paris day. Direct database browser-role access is denied; RPC is service-role only, security invoker.

Metrics are pageviews and sessions, never exact unique people. Only consented audience is counted. Sessions use sessionStorage, scoped to an origin and tab, renewed after 30 minutes between page loads or Paris midnight. No IP, UA, referrer, page URL, contact details or form data is written to analytics tables. Hosting/provider request logs remain governed by their existing configuration. Session UUIDs/event IDs are purged after 31 days on subsequent intake; aggregate daily totals after 400 days. Without subsequent intake, no purge runs. Existing marketing tracking remains separate.

## Integration pending

`website-audience.html` is prepared for the two restaurant global code blocks. Do not install it against legacy marketing consent. First update the cookie UI to explicit separate audience and Meta purposes: v2 key `oddos_meta_consent_v2`, record `{version:2,analytics:boolean,marketing:boolean,date:Date.now()}`. Accept all enables both, refuse all disables both, customize offers independently unticked audience and marketing switches. Add audience information to the privacy detail (session identifier for 30 minutes of inactivity; raw IDs kept 31 days, aggregates 400 days) and dispatch `new Event('oddos-audience-consent')` after changing the choice. Legacy consent must be requested again, not silently reused. The collector fails closed unless v2 analytics consent is true.

At release the database is prepared and counter logic verified in a rolled-back transaction. The two website installations are NOT activated: the browser UI was unavailable. No historical counts are manufactured. Dashboard empty state explicitly explains this.

## Validation

Production build passed with `next build --webpack` (local Turbopack cannot follow shared node_modules symlink). Pure validation/date/summary checks passed. SQL assertion verified 2 different page events in 1 session produce 2 pageviews / 1 visit and a replay does not increment. SQL test transaction rolled back. Anon/authenticated table reads and anon RPC execution are denied. Supabase advisor INFO for RLS with no policies is intentional server-only access.
