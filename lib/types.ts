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
  updatedAt: string;
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
  active: number;
  deactivated: number;
  blocked: number;
  deleted: number;
  admins: number;
  subscribed: number;
  trialExhausted: number;
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
