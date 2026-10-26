# Restaurant website counters

The protected Pilotage page `/visites-sites` separates two measurements:
- Global page loads: aggregate site/day totals only. No cookie, browser storage, IP address, URL, referrer, fingerprint, random visitor/event ID or cross-site linkage is read or stored by this counter. The script sends only the literal `{"mode":"aggregate"}`; the server derives the restaurant from the exact allowed Origin. Known robot UAs are filtered transiently and not written to the analytics tables. Daily totals are purged after 400 days on subsequent intake. Provider infrastructure logs remain governed by existing hosting settings. The UI and privacy details explain limitations; this is not a count of unique people or a guarantee of 100% coverage.
- Consented sessions: separate v2 analytics permission, tab-scoped sessionStorage, 30-minute inactivity between page loads / Paris midnight. Legacy v1 permission is not reused. Marketing is a distinct optional permission. UUID/event retention 31 days and daily totals 400 days, cleanup on subsequent intake.

The global script sends once per visible page load, with credentials omitted and no referrer, no retries, no per-user deduplication. Reloads count again. It cannot count visitors whose JavaScript/network/blocker prevents intake. Origin validation is not authentication and public counts can be inflated; metrics must not be treated as financial records.

`website-consent-and-counters.html` is the full common global snippet for both hostnames, including preserved navigation CSS and privacy notice. `website-global-page-count.html` is the aggregate counter only. Website UI editing requires preserving the full snippet and escaped HTML strings for Webador. Neither mode sends form details or contact data. Meta is never enabled by the aggregate counter or refusal of optional cookies.

Database tables and RPCs are server-only, RLS enabled, anon/authenticated privileges revoked, security invoker functions executable by service_role only. GET verifies Supabase user/profile, restricting restaurant profiles to their establishment. The global and consented daily tables remain separate, with no fabricated historical data.

Validation: production webpack build; rolled-back SQL tests and permission checks; on-site refusal and reloading checks. The summary separates all page loads from consented visits.
