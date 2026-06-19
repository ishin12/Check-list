import { getSupabase } from '@/services/supabase/client';

/**
 * Returns a viewable URL for a proof file in the `proofs` bucket. Works in both
 * demo mode (blob:// URL) and against real Supabase (signed URL valid for 1h).
 */
export async function getProofUrl(storagePath: string): Promise<string | null> {
  const sb = getSupabase().storage.from('proofs');
  const { data, error } = await sb.createSignedUrl(storagePath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeProofFile(storagePath: string): Promise<void> {
  await getSupabase().storage.from('proofs').remove([storagePath]);
}
