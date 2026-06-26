import { getSupabase } from '@/services/supabase/client';

export interface AppSettings {
  signingExpiryDays: number;
  signingReminderHours: number;
}

const DEFAULTS: AppSettings = { signingExpiryDays: 3, signingReminderHours: 24 };

export async function getAppSettings(): Promise<AppSettings> {
  const { data } = await getSupabase()
    .from('app_settings')
    .select('signing_expiry_days, signing_reminder_hours')
    .eq('id', true)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return {
    signingExpiryDays: data.signing_expiry_days ?? DEFAULTS.signingExpiryDays,
    signingReminderHours: data.signing_reminder_hours ?? DEFAULTS.signingReminderHours,
  };
}

export async function saveAppSettings(s: AppSettings): Promise<void> {
  const { error } = await getSupabase().from('app_settings').update({
    signing_expiry_days: s.signingExpiryDays,
    signing_reminder_hours: s.signingReminderHours,
    updated_at: new Date().toISOString(),
  }).eq('id', true);
  if (error) throw error;
}
