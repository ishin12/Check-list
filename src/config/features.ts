/**
 * Build-time feature switches. Off features keep their code and data but are
 * not reachable from the UI.
 */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

export const features = {
  /**
   * Send the client a WhatsApp signing link on submit (and auto-approve when it
   * expires). Hidden for now by owner decision (2026-09-27); Master Spec §36 Q2
   * is still open. With no links sent, the expire/reminder crons do nothing.
   */
  whatsappSigning: flag(import.meta.env.VITE_FEATURE_WHATSAPP_SIGNING, false),
} as const;
