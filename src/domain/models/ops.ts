import type { Signature, TaskResult } from './types';

export type Role = 'manager' | 'worker' | 'client';

export interface AppUser {
  id: string;
  role: Role;
  fullName?: string;
  email?: string;
  phone?: string;
  clientId?: string;
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
  results: TaskResult[];
  signature?: Signature;
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
