export type Language = 'en' | 'ar';

export type LocalizedText = Record<Language, string>;

export interface Task {
  id: string;
  label: LocalizedText;
  order: number;
  required: boolean;
}

export interface Template {
  id: string;
  title: LocalizedText;
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
  version: number;
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
