import type { Recurrence } from '@/domain/job/recurrence';

export type Language = 'en' | 'ar' | 'ur';

/** Right-to-left languages (Arabic, Urdu). */
export const RTL_LANGUAGES: readonly Language[] = ['ar', 'ur'];

/** English and Arabic are always entered; Urdu is optional and falls back. */
export type LocalizedText = { en: string; ar: string; ur?: string };

export interface Task {
  id: string;
  label: LocalizedText;
  order: number;
  required: boolean;
  /** Periodic maintenance item: shown when due rather than on every visit. */
  recurrence?: Recurrence;
  /** A photo must be attached before this item can be completed (BR-012). */
  photoRequired?: boolean;
}

export interface Template {
  id: string;
  title: LocalizedText;
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Scope: which project type / stage this checklist belongs to. */
  projectTypeId?: string;
  stageId?: string;
}

export interface TaskResult {
  taskId: string;
  checked: boolean;
  note?: string;
}

export interface Signature {
  dataUrl: string;
  signedAt: string;
  signerName?: string;
}

export interface Customer {
  name?: string;
  phone?: string;
}

export type JobStatus = 'draft' | 'completed';

export interface Job {
  id: string;
  templateId: string;
  /** Frozen copy of the template at job time so later edits don't alter past reports. */
  templateSnapshot: Template;
  customer?: Customer;
  results: TaskResult[];
  signature?: Signature;
  language: Language;
  status: JobStatus;
  createdAt: string;
  completedAt?: string;
}
