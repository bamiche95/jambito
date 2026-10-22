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
  server credential (`FIREBASE_SERVICE_ACCOUNT` or
  `GOOGLE_APPLICATION_CREDENTIALS`).
- **MongoDB** — `MONGODB_URI`.
- **Paystack** — `PAYSTACK_SECRET_KEY` (server only).
- **SMTP** — `SMTP_USER` / `SMTP_PASSWORD`. Without them contact and welcome
  email answer 503 and campaign email is never sent.
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
  a 3-day per-recipient cooldown, one message per second, and a 45-second time
  budget.
- Each email includes a stateless, HMAC-signed unsubscribe link
  (`/unsubscribe`). Unsubscribing only stops progress email — access is
  unaffected.
- The admin panel can preview (rendered with sample values), send a test to the
  admin's own address, dry-run an audience, or send a batch immediately.

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
- At most 100 recipients per broadcast, one message every half second, and the
  same 45-second budget as a campaign run. A batch that stops early leaves the
  rest pending; **Send remaining** continues it.
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
npm run check:mail        # SMTP credentials, without sending
npm run check:emails      # campaign state and send log (read-only)
```

## Deploy notes

- `NEXT_PUBLIC_*` values are inlined at build time: set them for every Vercel
  environment and redeploy after changing them.
- Run `scripts/ensure-indexes.mjs` against a new database once. The email dedupe
  index is what makes sends idempotent.
- Keep `/api/cron/emails` uncached (the service worker already treats it as
  network-only).
