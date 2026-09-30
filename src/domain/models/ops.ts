import type { Signature, TaskResult } from './types';
import type { Recurrence } from '@/domain/job/recurrence';

/**
 * 'worker' is the legacy field role and is treated as a supervisor until the
 * old task screens are replaced. 'finance' can also be granted to a manager
 * through AppUser.financeAccess.
 */
export type Role = 'manager' | 'supervisor' | 'finance' | 'worker' | 'client';

export interface AppUser {
  id: string;
  role: Role;
  fullName?: string;
  email?: string;
  phone?: string;
  clientId?: string;
  /** Finance permission granted on top of the role (manager + finance). */
  financeAccess?: boolean;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type FieldTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected';

export interface FieldTask {
  id: string;
  title: string;
  description?: string;
  templateId?: string;
  clientId: string;
  assignedWorkerId: string;
  scheduledAt: string;
  scheduledEnd?: string;
  status: FieldTaskStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  decisionAt?: string;
  decisionNote?: string;
  /** How the task reached 'approved' — drives a distinct UI/report treatment. */
  approvalMethod?: ApprovalMethod;
  results: TaskResult[];
  signature?: Signature;
  recurrence: Recurrence;
  seriesId?: string;
  extraWork: ExtraWorkEntry[];
}

export type ApprovalMethod = 'manager' | 'client_signature' | 'auto_no_response';

export interface ExtraWorkEntry {
  id: string;
  body: string;
  addedAt: string;
  addedBy: string;
  /** Cached author display name at write time. */
  addedByName?: string;
}

export type ProofKind = 'start' | 'finish';

export interface TaskProof {
  id: string;
  taskId: string;
  kind: ProofKind;
  storagePath: string;
  mime: string;
  capturedAt: string;
  uploadedAt: string;
  uploadedBy?: string;
}

export type NoteStatus = 'open' | 'resolved';

export interface ClientNote {
  id: string;
  clientId: string;
  body: string;
  status: NoteStatus;
  createdInTaskId?: string;
  resolvedInTaskId?: string;
  createdBy?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt?: string;
  emailSentAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Field operations (Master Spec v2.1) — mirrors supabase/migrations/0006.
// ---------------------------------------------------------------------------

/** Display text keyed by language code; Urdu ('ur') is optional for now. */
export type ConfigText = Partial<Record<'en' | 'ar' | 'ur', string>>;

export interface ProjectType {
  id: string;
  code: string;
  name: ConfigText;
  usesStages: boolean;
  sortOrder: number;
  active: boolean;
}

export interface ProjectStage {
  id: string;
  projectTypeId: string;
  code: string;
  name: ConfigText;
  sortOrder: number;
  active: boolean;
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'closed';

export interface Project {
  id: string;
  code?: string;
  name: string;
  clientId: string;
  projectTypeId: string;
  stageId?: string;
  status: ProjectStatus;
  supervisorId?: string;
  notes?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type EmployeeStatus = 'active' | 'inactive';

/** Crew member. Not an app user; supervisors are not employees. */
export interface Employee {
  id: string;
  code?: string;
  fullName: string;
  phone?: string;
  status: EmployeeStatus;
  notes?: string;
  /** When the worker was added (YYYY-MM-DD…); earlier days are not "unallocated". */
  createdAt?: string;
  /** Last change; for an inactive worker, when they were switched off. */
  updatedAt?: string;
}

export type VisitStatus = 'planned' | 'in_progress' | 'completed';

export interface Visit {
  id: string;
  projectId: string;
  /** YYYY-MM-DD */
  visitDate: string;
  supervisorId: string;
  status: VisitStatus;
  startedAt?: string;
  completedAt?: string;
  notes?: string;
}

export type TaskItemStatus = 'open' | 'completed' | 'needs_follow_up';
export type TaskItemSource = 'manual' | 'checklist' | 'stage' | 'recurring';

/** One task record per project, re-shown in each visit until completed. */
export interface ProjectTask {
  id: string;
  projectId: string;
  visitId?: string;
  source: TaskItemSource;
  templateId?: string;
  templateItemId?: string;
  recurringItemId?: string;
  description: string;
  status: TaskItemStatus;
  /** Must be answered (done / not done / follow-up) on the visit. */
  required: boolean;
  photoRequired: boolean;
  note?: string;
  completedAt?: string;
  completedInVisitId?: string;
  lastVisitId?: string;
  createdAt: string;
  /** Visit on which the task became a follow-up (0008); correctable while it is in progress. */
  followUpVisitId?: string;
  /** Optional checklist item offered on a visit but not saved until used. */
  pending?: boolean;
}

export interface ProjectRecurringItem {
  id: string;
  projectId: string;
  templateId?: string;
  templateItemId?: string;
  description: string;
  recurrence: Exclude<Recurrence, 'none'>;
  /** YYYY-MM-DD */
  lastDoneOn?: string;
  /** YYYY-MM-DD */
  nextDueOn: string;
  photoRequired: boolean;
  active: boolean;
}

export type PhotoKind = 'before' | 'after';

export interface TaskPhoto {
  id: string;
  taskId: string;
  visitId?: string;
  projectId: string;
  kind?: PhotoKind;
  storagePath: string;
  mime: string;
  capturedAt: string;
  voidedAt?: string;
}

export type LaborDuration = 0.5 | 1;

export interface LaborAllocation {
  id: string;
  /** YYYY-MM-DD */
  workDate: string;
  employeeId: string;
  projectId: string;
  visitId?: string;
  duration: LaborDuration;
  supervisorId: string;
  notes?: string;
  changeReason?: string;
  voidedAt?: string;
  voidReason?: string;
}

export interface MonthClose {
  /** First day of the month, YYYY-MM-01 */
  month: string;
  closedAt: string;
  closedBy: string;
}

export interface VisitReport {
  id: string;
  visitId: string;
  reportNumber: number;
  signatureStatus: 'unsigned' | 'signed';
  signerName?: string;
  signedAt?: string;
  generatedAt: string;
  /** Frozen at completion so later visits never change an issued report. */
  content?: VisitReportContent;
}

export interface VisitReportTaskLine {
  taskId: string;
  description: string;
  status: TaskItemStatus;
  note?: string;
  photos: { id: string; kind?: PhotoKind; storagePath: string; mime: string }[];
}

export interface VisitReportContent {
  reportNumber?: number;
  projectName: string;
  projectCode?: string;
  clientName: string;
  visitDate: string;
  supervisorName: string;
  completedAt?: string;
  /** Everything that was on the visit. */
  required: VisitReportTaskLine[];
  /** Done on this visit. */
  done: VisitReportTaskLine[];
  /** Needs follow-up or not done — carried to the next visit. */
  followUp: VisitReportTaskLine[];
  crew: { name: string; duration: number }[];
  clientRepName?: string;
  /** The supervisor's visit notes (UAT D-28). */
  visitNotes?: string;
}
