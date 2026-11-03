# CBT-Practice (jambito)

Next.js 16 app for JAMB / WAEC / POST UTME / GCE / GST past-question practice:
an offline-first CBT runner, a server-side trial gate, Paystack access, an admin
dashboard, and automated progress emails.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # Next.js + the Serwist service worker
```

Production build:

```bash
npm run build
npm start
```

## Environment

`.env.example` documents every variable. The important groups:

- **Firebase** — `NEXT_PUBLIC_FIREBASE_*` (public, inlined at build time) and a
  server credential: `FIREBASE_SERVICE_ACCOUNT` (the JSON itself) wherever the
  app is deployed, and `GOOGLE_APPLICATION_CREDENTIALS` (a path to the key file)
  locally. See the Firebase Admin block in `.env.example`: the path form never
  works on Vercel.
- **MongoDB** — `MONGODB_URI`.
- **Paystack** — `PAYSTACK_SECRET_KEY` (server only).
- **Brevo** — `BREVO_API_KEY` (server only) is the transport for every
  student-facing email, with `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` for the
  From line. The sender must be verified in Brevo and the domain authenticated
  (SPF/DKIM) or mail is rejected or filed as spam.
- **SMTP** — `SMTP_USER` / `SMTP_PASSWORD` for the Go54 mailbox: the contact
  form's inbox and the welcome mail. Without them those two answer 503. Without
  `BREVO_API_KEY`, campaign email falls back to this mailbox (and hits its
  burst throttle).
- **Cron / unsubscribe** — `CRON_SECRET` and `EMAIL_UNSUBSCRIBE_SECRET`. Campaign
  email refuses to send without an unsubscribe signing key.

## Practice data

Practice records live in MongoDB, not only in the browser:

| Collection          | Contents                                                        |
| ------------------- | --------------------------------------------------------------- |
| `practiceAttempts`  | One document per completed attempt, `_id = <uid>:<sessionId>`.    |
| `practiceSessions`  | One paused set per exam/subject/year, `_id = <uid>:<key>`, with the answers needed to resume. |
| `users.practice`     | Denormalised counters and the newest paused sets, rebuilt on write. |

The client is still offline-first. `lib/practiceRepo.ts` writes to IndexedDB
first and queues the server write in a durable outbox (`syncQueue`, IndexedDB
v3); the queue drains on the next connection, on `pagehide`, and after a
debounced autosave. Every write is idempotent, so a retry cannot duplicate an
attempt.

History that predates server-side storage is imported once per account by
`POST /api/practice/import` (guarded by a localStorage flag). The import is
safe to repeat.

Deleting an account from the admin dashboard purges both practice collections
and unsets `users.practice`.

Indexes (also created lazily on first use):

```bash
node --env-file=.env.local scripts/ensure-indexes.mjs
```

## Automated progress emails

Four campaigns, all disabled until an admin turns them on in
**Admin -> Emails**:

| Campaign            | Fires when                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `never_started`     | 2 days after sign-up with no attempts and no paused set.           |
| `trial_complete`    | A day after the last free question, with no active subscription.   |
| `unfinished_set`    | A paused set has been idle 2 days (at most once every 7 days).     |
| `subscriber_thanks` | Immediately after a verified payment (via `after()` in the webhook).|

How it stays safe:

- Every message is claimed in `emailLog` with a unique
  `{campaignId, dedupeKey}` index **before** it is sent, so a retried or
  overlapping run cannot double-send.
- A global pause switch, a per-campaign enable flag, a daily cap (default 200),
  a 3-day per-recipient cooldown, and a 45-second time budget.
- Each email includes a stateless, HMAC-signed unsubscribe link
  (`/unsubscribe`). Unsubscribing only stops progress email — access is
  unaffected.
- The admin panel can preview (rendered with sample values), send a test to the
  admin's own address, dry-run an audience, or send a batch immediately.

Delivery goes through Brevo (`lib/brevo.js`), not the mailbox:

- Each campaign is rendered once into a Brevo transactional template
  (`lib/brevoTemplates.js`) where every `{{placeholder}}` becomes
  `{{ params.placeholder }}`. The template is only re-pushed when the rendered
  copy changes (a hash on `emailCampaigns` remembers the last push), so a run
  normally costs zero template calls.
- A run claims its whole batch first, then sends it in **one** API call:
  `POST /v3/smtp/email` with one `messageVersions` entry per student, each with
  its own `params` (name, progress, unsubscribe link). No SMTP session, so
  nothing throttles the fourth message.
- The `emailLog` claim stays the ledger: it is still taken before the send, and
  every claim is marked `sent` or `failed` afterwards. `failed` rows now carry
  the provider's own reason.
- Every error carries a code (`brevo_unauthorized`, `brevo_ip_blocked`,
  `brevo_credits`, `brevo_rate_limited`, `brevo_rejected`, ...). 429s and 5xx are
  retried twice with Brevo's own `retry-after` hint. `brevo_ip_blocked` means the
  account allowlists IPs and the request came from an address that is not on the
  list — the fix is the address, not the key.
- Without `BREVO_API_KEY` the runner falls back to the Go54 mailbox exactly as
  before, one message per second, so a deployment can be switched over without
  a code change.

Two checks that answer "will this deployment actually send?":

- **Admin -> Emails -> Check Brevo** (`POST {"action":"brevo_check"}`) asks the
  provider: is the key accepted, is the From address a verified sender or on an
  authenticated domain, does the domain have SPF/DKIM, and how many credits are
  left. A present `BREVO_API_KEY` proves none of that on its own — this account
  once answered every request with a 401 about an unlisted IP, which reads like a
  bad key.
- `npm run check:brevo -- --templates` lists the pushed templates. When Brevo
  answers that endpoint with `{}` (as this account does) the script says it could
  not read the list rather than claiming there are none; use **Push templates**
  in the dashboard, which reports what it pushed.

The daily cap (default 200) is a deliberate brake, and it is also the only thing
keeping a run under the free plan's 300 emails/day. Raise it only as high as the
plan allows.

Scheduling: `vercel.json` runs `GET /api/cron/emails` daily at 07:00. Vercel
sends `Authorization: Bearer $CRON_SECRET` automatically when the variable is
set. The route also accepts POST for other schedulers.

Rollout order used for this app: enable `never_started` first, then
`trial_complete`, then `subscriber_thanks`, then `unfinished_set`, checking the
dry run and a test send before each.

## One-off emails

**Admin -> Emails -> Compose email** sends a single email to hand-picked
accounts (no segments): search by email or uid, tick the accounts, write the copy
(or start from a saved template / a campaign's copy), preview it, send a test to
yourself, then confirm the send.

How it stays safe:

- The composer only ever sends **uids**. The API looks every address up itself,
  so a compromised admin token cannot turn the dashboard into an open relay.
- At most 100 recipients per broadcast, and the same 45-second budget as a
  campaign run. A batch that stops early leaves the rest pending; **Send
  remaining** continues it. Broadcasts are rendered per recipient and sent over
  Brevo (one call each, no throttle); the mailbox fallback still pauses between
  messages.
- The global pause switch blocks broadcasts, and the daily cap is shared with the
  campaigns. Preview and "Send test to me" still work while paused.
- Each delivery is claimed in `emailLog` under `broadcast:<broadcastId>` before
  it is sent, so a retry (or a double click) can never mail the same person
  twice. Opted-out and address-less accounts are recorded as `skipped`.
- The unsubscribe link is mandatory: sending is refused when
  `EMAIL_UNSUBSCRIBE_SECRET` is missing.
- Templates (`emailTemplates`, capped at 50) store copy only, never recipients.
  A send freezes its copy and audience on the `emailBroadcasts` document, so
  editing or deleting a template later cannot change an email that is still
  going out.

## Useful commands

```bash
npm run lint
npx tsc --noEmit
npm run verify:deps
npm run check:mail        # Go54 mailbox credentials, without sending
npm run check:brevo       # Brevo key, sender, domain and campaign templates
npm run check:emails      # campaign state and send log (read-only)
```

## Deploy notes

- `NEXT_PUBLIC_*` values are inlined at build time: set them for every Vercel
  environment and redeploy after changing them.
- Server credentials are read at runtime. Set `FIREBASE_SERVICE_ACCOUNT` (the
  service-account JSON, on one line) on Vercel and do **not** set
  `GOOGLE_APPLICATION_CREDENTIALS` there: it is a path to a gitignored key file,
  so a deployed function can never read it — it is skipped with a warning and the
  Admin SDK falls back to project-ID-only initialisation. That fallback still
  verifies ID tokens (sign-in, trial gate, payments) and MongoDB still enforces a
  block, but the block cannot be mirrored to Firebase: the account stays able to
  sign in and its refresh tokens are not revoked. Remove the variable from every
  Vercel environment, Development included, or `vercel env pull` copies it back
  into `.env.local`.
- `GET /api/health` reports the credential the Admin SDK actually resolved
  (`credential.source`, `credential.hasServiceAccount`, `credential.error`), which
  should be `FIREBASE_SERVICE_ACCOUNT` in production.
- Run `scripts/ensure-indexes.mjs` against a new database once. The email dedupe
  index is what makes sends idempotent.
- Keep `/api/cron/emails` uncached (the service worker already treats it as
  network-only).
