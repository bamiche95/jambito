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
  name?: string;
  email?: string;
  isSubscribed?: boolean;
  subscriptionExpiry?: string | null;
  plan?: string;
}
