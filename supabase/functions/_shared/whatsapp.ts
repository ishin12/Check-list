// Shared WhatsApp Cloud API helper for Edge Functions.
// Tier-0 unverified accounts can only send pre-approved templates to
// business-initiated conversations, so every send here is a template send.
//
// The messages endpoint identifies a template by NAME + LANGUAGE CODE only —
// there is no namespace parameter on the Cloud API (that was an On-Premises
// API concept).

export interface TemplateSendResult {
  ok: boolean;
  messageId?: string;
  error?: unknown;
}

interface ButtonUrlParam {
  /** The dynamic part appended to the template's button base URL (the token). */
  urlSuffix: string;
}

/**
 * Send a WhatsApp template message.
 *
 * @param to        Recipient in international format without '+', e.g. 966501234567
 * @param template  Approved template name
 * @param lang      Language code, e.g. 'ar' or 'en'
 * @param bodyParams Ordered {{1}},{{2}},... body variables
 * @param button    Optional dynamic URL button suffix (the token)
 */
export async function sendTemplate(
  to: string,
  template: string,
  lang: string,
  bodyParams: string[],
  button?: ButtonUrlParam,
): Promise<TemplateSendResult> {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured' };
  }

  const components: unknown[] = [];
  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text })),
    });
  }
  if (button) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: button.urlSuffix }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: to.replace(/[^\d]/g, ''),
    type: 'template',
    template: {
      name: template,
      language: { code: lang },
      components,
    },
  };

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (!resp.ok) {
      return { ok: false, error: json };
    }
    const messageId = json?.messages?.[0]?.id as string | undefined;
    return { ok: true, messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
