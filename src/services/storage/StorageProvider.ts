import type { Job, Language, Template } from '@/domain/models/types';

export interface Settings {
  language: Language;
}

/**
 * Persistence contract for the app. The MVP ships a localStorage-backed
 * implementation; a future ApiStorageProvider can satisfy the same interface
 * so screens never need to change. All methods are async to allow a network
 * implementation later without touching callers.
 */
export interface StorageProvider {
  // Templates
  listTemplates(): Promise<Template[]>;
  getTemplate(id: string): Promise<Template | undefined>;
  saveTemplate(template: Template): Promise<void>;
  deleteTemplate(id: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  // Jobs (no persistence in MVP — reserved for a future backend)
  saveJob?(job: Job): Promise<void>;
  listJobs?(): Promise<Job[]>;
}
