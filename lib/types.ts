/**
 * Shared TypeScript types used across the client (CBT engine, offline store)
 * and referenced by the server data layer for documentation purposes.
 */

import type { AccountStatus } from "./accountStatus";

export interface Question {
  id: string | number;
  question: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation?: string;
  subject?: string;
  year?: string;
  exam?: string;
  image?: string;
}

export interface QuestionsPagination {
  total?: number;
  per_page?: number;
  current_page?: number;
  total_pages?: number;
}

/**
 * A question sent to a trial-exhausted visitor for the locked preview. The
 * server strips the answer key, so `correctAnswer` and `explanation` are
 * genuinely absent — never render or grade a teaser as if it were a full
 * question.
 */
export interface TeaserQuestion
  extends Omit<Question, "correctAnswer" | "explanation"> {
  /** Never sent for a teaser: typed as `undefined` so callers must check. */
  correctAnswer?: undefined;
  explanation?: undefined;
}

/** Any question the CBT views can render (full question or locked teaser). */
export type PracticeQuestion = Question | TeaserQuestion;

export interface TeaserPayload {
  questions: TeaserQuestion[];
  pagination?: QuestionsPagination | null;
  source?: "cache" | "api";
}

export interface QuestionsPayload {
  questions: Question[];
  pagination?: QuestionsPagination | null;
  source?: "cache" | "api" | "offline";
}

export interface AttemptRecord {
  key: string;
  exam: string;
  subject: string;
  year: string;
  score: number;
  total: number;
  percentage: number;
  date: string;
  /** Idempotency key shared with the completed practice session. */
  sessionId?: string;
  /**
   * The account this cached row belongs to. Set client-side only; the server
   * derives ownership from the authenticated uid. Rows without it predate
   * server-side history and belong to whoever first signs in on this device.
   */
  uid?: string;
}

export interface PracticeSession {
  /** Unique across retakes of the same exam set. */
  id: string;
  /** Canonical exam/subject/year key used to resume the matching set. */
  key: string;
  exam: string;
  subject: string;
  year: string;
  answers: Record<string, string>;
  remainingSeconds: number;
  durationSeconds: number;
  scrollY: number;
  /**
   * Questions in the set, when known. Optional because sessions saved before
   * the server migration did not record it.
   */
  total?: number;
  /** Cache owner; see the note on `AttemptRecord.uid`. */
  uid?: string;
  updatedAt: string;
}

/** One row of the denormalised `users.practice.bySubject` rollup. */
export interface PracticeSubjectSummary {
  exam: string;
  subject: string;
  sessions: number;
  score: number;
  total: number;
}

/** A paused set, as summarised on the user doc (no answer map). */
export interface PracticeInProgressSummary {
  key: string;
  exam: string;
  subject: string;
  year: string;
  answered: number;
  total: number | null;
  remainingSeconds: number;
  updatedAt: string;
}

/**
 * The server-side aggregate behind History, Stats and the progress emails.
 *
 * Recomputed by `lib/practice.js` on every write, so it can be read on its own
 * without touching the attempts collection or any answer map.
 */
export interface PracticeSummary {
  completedSessions: number;
  totalQuestions: number;
  totalScore: number;
  averagePercentage: number | null;
  lastCompletedAt: string | null;
  bySubject: PracticeSubjectSummary[];
  inProgress: PracticeInProgressSummary[];
  lastActivityAt: string | null;
}

export interface Profile {
  uid?: string;
  name?: string;
  email?: string;
  role?: "user" | "admin";
  /** Account lifecycle state; anything but "active" means content is refused. */
  status?: AccountStatus;
  isSubscribed?: boolean;
  subscriptionExpiry?: string | null;
  plan?: string;
  trialCount?: number;
  /** Aggregate practice figures, when the account has any activity. */
  practice?: PracticeSummary | null;
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

/** A user row exactly as /api/admin returns it (already PII-trimmed). */
export interface AdminUser {
  uid: string;
  email: string | null;
  role: "user" | "admin";
  status: AccountStatus;
  isSubscribed: boolean;
  subscriptionExpiry: string | null;
  plan: string | null;
  trialCount: number;
  trialRemaining: number;
  reference: string | null;
  amount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminStats {
  total: number;
  /** Accounts that are neither soft-deleted nor staff — the funnel denominator. */
  live: number;
  active: number;
  deactivated: number;
  blocked: number;
  deleted: number;
  admins: number;
  subscribed: number;
  /** Used every free question, whether or not they later subscribed. */
  trialExhausted: number;
  /** Signed up but never answered a question. */
  neverStarted: number;
  /** Started the free questions but has some left. */
  inProgress: number;
  /** Exhausted the trial and has no active subscription — the win-back list. */
  exhaustedUnsubscribed: number;
  /** Accounts created in the last 7 / 30 days. */
  joined7Days: number;
  joined30Days: number;
}

export interface AdminUsersPayload {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  stats: AdminStats;
}

/** What a Firebase-side user management call managed to do. */
export interface FirebaseActionResult {
  ok: boolean;
  skipped: boolean;
  message: string;
}

export interface GrantResult {
  plan: string;
  durationDays: number;
  mode: "set" | "extend";
  expiry: string;
  stackedFrom: string | null;
}

export interface AdminActionPayload {
  user?: AdminUser;
  granted?: GrantResult | null;
  firebase?: FirebaseActionResult | null;
  payment?: PaymentRecord | null;
}

/** One row of the payments ledger. */
export interface PaymentRecord {
  id: string | null;
  reference: string;
  uid: string | null;
  email: string | null;
  amountKobo: number;
  amountNaira: number;
  plan: string | null;
  source: "paystack" | "manual" | null;
  status: "success" | "pending" | "failed" | null;
  channel: string | null;
  note: string | null;
  bankReference: string | null;
  createdBy: string | null;
  granted: boolean;
  grantedDays: number | null;
  grantedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaymentStats {
  total: number;
  granted: number;
  failed: number;
}

export interface PaymentsPayload {
  payments: PaymentRecord[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  stats: PaymentStats;
}

/** Paystack's own record of a charge, as relayed by /api/admin/reconcile. */
export interface PaystackSummary {
  httpStatus: number;
  verified: boolean;
  message: string | null;
  status: string | null;
  amountKobo: number | null;
  amountNaira: number | null;
  currency: string | null;
  channel: string | null;
  paidAt: string | null;
  email: string | null;
  uid: string | null;
  plan: string | null;
  inferredPlan: string | null;
  reference: string | null;
  gatewayResponse: string | null;
}

export interface ReconcilePayload {
  applied?: boolean;
  alreadyGranted?: boolean;
  paystack?: PaystackSummary;
  payment?: PaymentRecord | null;
  user?: AdminUser;
  granted?: GrantResult | null;
}

/** The subset of a user document captured in the audit trail. */
export interface AuditSnapshot {
  status: AccountStatus;
  role: "user" | "admin";
  isSubscribed: boolean;
  subscriptionExpiry: string | null;
  plan: string | null;
  trialCount: number;
}

export interface AuditEntry {
  id: string;
  actorUid: string | null;
  actorEmail: string | null;
  action: string;
  targetUid: string | null;
  targetEmail: string | null;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  details: Record<string, unknown> | null;
  firebase: string | null;
  createdAt: string | null;
}

export interface AuditPayload {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * The live price of the single offer — a subset of the plan definition, because
 * only these five fields are ever sent to the browser.
 *
 * Display data only: the amount that will actually be charged is decided
 * server-side by /api/payments/initialize, which reads the same stored price.
 */
export interface Pricing {
  planId: string;
  planName: string;
  priceNaira: number;
  /** Exact amount in kobo, as Paystack expects. */
  priceKobo: number;
  durationDays: number;
}

export interface PricingPayload {
  success: boolean;
  pricing: Pricing;
}

/** GET /api/admin/pricing — the live price plus where it came from. */
export interface AdminPricingPayload {
  success: boolean;
  pricing: Pricing & {
    /** `db` = an admin override is stored; `default` = the built-in figure. */
    source: "db" | "default";
    updatedAt: string | null;
    updatedBy: { uid: string | null; email: string | null } | null;
  };
  /** The built-in figure, so the panel can offer it as the reset value. */
  defaults: { priceNaira: number; priceKobo: number };
}

// ---------------------------------------------------------------------------
// Automated email campaigns
// ---------------------------------------------------------------------------

/** The part of a campaign an admin can edit. */
export interface EmailCampaignContent extends EmailBroadcastContent {
  enabled: boolean;
  delayDays: number;
}

export interface AdminEmailCampaign extends EmailCampaignContent {
  id: string;
  name: string;
  summary: string;
  when: string;
  /** Minimum days between two campaign emails to the same student. */
  cooldownDays: number;
  defaults: EmailCampaignContent;
  /** The Brevo template mirroring this copy; null until it is pushed once. */
  brevoTemplateId: number | null;
  brevoTemplateHash: string | null;
  brevoTemplatePushedAt: string | null;
  updatedAt: string | null;
  updatedBy: { uid: string | null; email: string | null } | null;
  stats: {
    sent: number;
    failed: number;
    sending: number;
    lastSentAt: string | null;
  };
}

export interface AdminEmailSettings {
  paused: boolean;
  dailyCap: number;
  lastRunAt: string | null;
  lastRunSummary: EmailRunSummary | null;
  updatedAt: string | null;
  updatedBy: { uid: string | null; email: string | null } | null;
}

export interface AdminEmailSend {
  id: string;
  campaignId: string;
  email: string;
  status: string;
  sentAt: string | null;
  createdAt: string | null;
  error: string | null;
}

export interface EmailRunCampaignResult {
  id: string;
  name: string;
  enabled: boolean;
  audience: number;
  sent: number;
  failed: number;
  skipped: number;
  reason: string | null;
  recipients: string[];
}

/** What a run (or a dry run) did, also stored as `settings.lastRunSummary`. */
export interface EmailRunSummary {
  startedAt: string;
  finishedAt: string | null;
  dryRun: boolean;
  /** Which transport carried the batch: Brevo, or the Go54 mailbox fallback. */
  transport?: "brevo" | "smtp";
  sent: number;
  failed: number;
  skipped: number;
  campaigns: EmailRunCampaignResult[];
  stoppedReason: string | null;
}

export interface AdminEmailsPayload {
  success: boolean;
  settings: AdminEmailSettings;
  campaigns: AdminEmailCampaign[];
  recent: AdminEmailSend[];
  counts: { unsubscribed: number; sentToday: number };
  mailConfigured: boolean;
  /** True when BREVO_API_KEY is set: the transport campaigns actually use. */
  brevoConfigured: boolean;
  /** The address Brevo sends from (it must be a verified sender). */
  brevoSender: string;
  unsubscribeConfigured: boolean;
  variables: { token: string; description: string }[];
  siteUrl: string;
  templates: AdminEmailTemplate[];
  broadcasts: AdminEmailBroadcast[];
  broadcastLimits: {
    maxRecipients: number;
    /** Daily-cap headroom, so the composer can warn before a send. */
    remainingToday: number;
  };
}

/** A rendered campaign, for the preview iframe. */
export interface EmailPreview {
  subject: string;
  text: string;
  html: string;
}

/**
 * The result of asking Brevo itself whether this deployment can send.
 *
 * `ready` means Brevo will accept the message; `deliverable` means the sending
 * domain has SPF/DKIM, which is what keeps it out of a spam folder. The two
 * differ exactly when the From address is a verified sender but its domain was
 * never authenticated.
 */
export interface EmailBrevoStatus {
  ready: boolean;
  deliverable: boolean;
  sender: { email: string; name: string; verified: boolean; active: boolean };
  domain: { name: string; authenticated: boolean } | null;
  account: {
    email: string | null;
    plan: string | null;
    credits: number | null;
  };
  message: string;
}

export interface EmailActionPayload {
  success: boolean;
  message?: string;
  campaign?: AdminEmailCampaign;
  settings?: AdminEmailSettings;
  preview?: EmailPreview;
  summary?: EmailRunSummary;
  dryRun?: boolean;
  /** `brevo_check` only: what the provider says about key, sender and domain. */
  brevo?: EmailBrevoStatus;
}

// ---------------------------------------------------------------------------
// One-off broadcasts and saved templates
// ---------------------------------------------------------------------------

/** The editable copy of a broadcast or a saved template (no campaign rules). */
export interface EmailBroadcastContent {
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
}

/** A saved, reusable template: copy-on-use, never mutated by a send. */
export interface AdminEmailTemplate extends EmailBroadcastContent {
  id: string;
  name: string;
  updatedAt: string | null;
  updatedBy: { uid: string | null; email: string | null } | null;
}

/** One row of the composer's recipient picker. */
export interface AdminEmailRecipient {
  uid: string;
  email: string;
  status: AccountStatus;
  isSubscribed: boolean;
  unsubscribed: boolean;
}

export interface AdminEmailRecipientsPayload {
  success: boolean;
  recipients: AdminEmailRecipient[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** A broadcast in the admin panel's history list. */
export interface AdminEmailBroadcast {
  id: string;
  subject: string;
  status: "sending" | "sent" | "partial";
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  createdAt: string | null;
  finishedAt: string | null;
  createdBy: { uid: string | null; email: string | null } | null;
}

/** What one broadcast batch managed to deliver. */
export interface EmailBroadcastSummary {
  sent: number;
  failed: number;
  skipped: number;
  /** Recipients still to attempt (pending plus retryable failures). */
  remaining: number;
  stoppedReason: string | null;
}

export interface EmailBroadcastPayload {
  success: boolean;
  message?: string;
  broadcastId?: string;
  summary?: EmailBroadcastSummary;
  preview?: EmailPreview;
  template?: AdminEmailTemplate;
}
