import type { Template } from '@/domain/models/types';
import { seedTemplates } from './seed';
import type { Settings, StorageProvider } from './StorageProvider';

const TEMPLATES_KEY = 'checklist.templates.v1';
const SETTINGS_KEY = 'checklist.settings.v1';
const SEEDED_KEY = 'checklist.seeded.v1';

const DEFAULT_SETTINGS: Settings = { language: 'en' };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export class LocalStorageProvider implements StorageProvider {
  private ensureSeeded(): Template[] {
    const existing = readJson<Template[] | null>(TEMPLATES_KEY, null);
    if (existing && existing.length >= 0 && localStorage.getItem(SEEDED_KEY)) {
      return existing;
    }
    if (existing && existing.length > 0) {
      localStorage.setItem(SEEDED_KEY, '1');
      return existing;
    }
    const seeded = seedTemplates();
    writeJson(TEMPLATES_KEY, seeded);
    localStorage.setItem(SEEDED_KEY, '1');
    return seeded;
  }

  async listTemplates(): Promise<Template[]> {
    const templates = this.ensureSeeded();
    return templates
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const templates = this.ensureSeeded();
    return templates.find((t) => t.id === id);
  }

  async saveTemplate(template: Template): Promise<void> {
    const templates = this.ensureSeeded();
    const index = templates.findIndex((t) => t.id === template.id);
    if (index >= 0) {
      templates[index] = template;
    } else {
      templates.push(template);
    }
    writeJson(TEMPLATES_KEY, templates);
  }

  async deleteTemplate(id: string): Promise<void> {
    const templates = this.ensureSeeded().filter((t) => t.id !== id);
    writeJson(TEMPLATES_KEY, templates);
  }

  async getSettings(): Promise<Settings> {
    return readJson<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  }

  async saveSettings(settings: Settings): Promise<void> {
    writeJson(SETTINGS_KEY, settings);
  }
}
