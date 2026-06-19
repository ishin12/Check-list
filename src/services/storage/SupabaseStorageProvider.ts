import type { Job, Template } from '@/domain/models/types';
import { getSupabase } from '@/services/supabase/client';
import type { Settings, StorageProvider } from './StorageProvider';

const SETTINGS_KEY = 'checklist.settings.v1';
const DEFAULT_SETTINGS: Settings = { language: 'en' };

interface TemplateRow {
  id: string;
  title: Template['title'];
  tasks: Template['tasks'];
  version: number;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    title: r.title,
    tasks: r.tasks ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
  };
}

/**
 * Storage backed by Supabase Postgres. Templates and jobs live in the database
 * (gated by RLS); settings stay in localStorage because they're per-device
 * preferences (language, etc.).
 */
export class SupabaseStorageProvider implements StorageProvider {
  async listTemplates(): Promise<Template[]> {
    const { data, error } = await getSupabase()
      .from('templates').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data as TemplateRow[]).map(rowToTemplate);
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const { data, error } = await getSupabase()
      .from('templates').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToTemplate(data as TemplateRow) : undefined;
  }

  async saveTemplate(template: Template): Promise<void> {
    const row = {
      id: template.id,
      title: template.title,
      tasks: template.tasks,
      version: template.version,
      updated_at: new Date().toISOString(),
    };
    const { error } = await getSupabase().from('templates').upsert(row);
    if (error) throw error;
  }

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await getSupabase().from('templates').delete().eq('id', id);
    if (error) throw error;
  }

  async getSettings(): Promise<Settings> {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) as Settings : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  /** Jobs are written into the `tasks` table's results/signature columns. */
  async saveJob(job: Job): Promise<void> {
    if (!job.templateId) return;
    const patch = {
      results: job.results,
      signature: job.signature,
      finished_at: job.completedAt ?? null,
    };
    const { error } = await getSupabase()
      .from('tasks').update(patch).eq('id', job.id);
    if (error) throw error;
  }

  async listJobs(): Promise<Job[]> {
    return [];
  }
}
