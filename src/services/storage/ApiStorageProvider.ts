import type { Job, Template } from '@/domain/models/types';
import type { Settings, StorageProvider } from './StorageProvider';

/**
 * Placeholder for a future backend implementation. When server-side storage is
 * added, implement these methods against the API and switch the factory in
 * ./index.ts — no screen code needs to change.
 */
export class ApiStorageProvider implements StorageProvider {
  constructor(private readonly baseUrl: string) {}

  private notImplemented(): never {
    throw new Error(
      `ApiStorageProvider is not implemented yet (baseUrl: ${this.baseUrl}).`,
    );
  }

  listTemplates(): Promise<Template[]> {
    return this.notImplemented();
  }
  getTemplate(): Promise<Template | undefined> {
    return this.notImplemented();
  }
  saveTemplate(): Promise<void> {
    return this.notImplemented();
  }
  deleteTemplate(): Promise<void> {
    return this.notImplemented();
  }
  getSettings(): Promise<Settings> {
    return this.notImplemented();
  }
  saveSettings(): Promise<void> {
    return this.notImplemented();
  }
  saveJob(_job: Job): Promise<void> {
    return this.notImplemented();
  }
  listJobs(): Promise<Job[]> {
    return this.notImplemented();
  }
}
