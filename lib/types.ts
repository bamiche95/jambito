/**
 * Shared TypeScript types used across the client (CBT engine, offline store)
 * and referenced by the server data layer for documentation purposes.
 */

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
}

export interface Profile {
  uid?: string;
  name?: string;
  email?: string;
  role?: "user" | "admin";
  isSubscribed?: boolean;
  subscriptionExpiry?: string | null;
  plan?: string;
  trialCount?: number;
}
