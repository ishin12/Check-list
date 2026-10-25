# WhatsApp templates

Status: **nothing was changed for Urdu.** The Edge Functions still send the two
Arabic (`ar`) templates exactly as before. This file documents what is used today
and what would be needed to send Urdu messages.

The Cloud API identifies a template by **name + language code**. A template name
approved in `ar` is a different template from the same name approved in `ur`.

## Templates in use today

| Template name | Sent by | Language code | Category | Body variables | Button |
|---|---|---|---|---|---|
| `ghsoon_najd_sign_request` | `supabase/functions/send-sign-link/index.ts` | `ar` (hard-coded) | UTILITY | `{{1}}` client name, `{{2}}` visit/task title, `{{3}}` days until the link expires | one dynamic URL button, base `https://<host>/sign/`, `{{1}}` = signing token |
| `ghsoon_najd_sign_reminder` | `supabase/functions/send-reminder/index.ts` | `ar` (hard-coded) | UTILITY | `{{1}}` visit/task title, `{{2}}` hours until expiry | same dynamic URL button |

Notes taken from the code and `SUPABASE_SETUP.md`:

- Parameters are passed in order through `sendTemplate(to, template, lang, bodyParams, button)` in `supabase/functions/_shared/whatsapp.ts`.
- There is no link in the body; the signing link is only in the button.
- `send-sign-link` also computes `scheduled = ... toLocaleDateString('ar')` but does not pass it to the template (unused variable).
- The language is not read from any client or user record; it is the literal `'ar'` in both functions.

## What is needed to send in Urdu

1. **Meta approval.** Submit Urdu (`ur`) versions of both templates in WhatsApp Manager, same names, same variables and the same dynamic URL button (base `https://<host>/sign/`). Suggested bodies are below.
2. **A language per client.** Add a field (for example `clients.preferred_language`, values `ar` / `ur` / `en`, default `ar`). This needs a database migration, which was out of scope here and has not been made.
3. **Code change** in both functions: read the client's language, map it to the template language code (`ar` / `ur` / `en`), and fall back to `ar` if the language is missing or that template version is not yet approved. Add a field for it to the client form (`ClientNewScreen`, `ClientDetailScreen`).
4. Test with a real recipient after approval; template approval can take from minutes to a couple of days, and Meta may re-categorise or reject wording.

Until all of that exists, Urdu-speaking clients keep receiving the Arabic message, while the signing page itself (`/sign/<token>`) already follows the app language chosen on the device that opens it.

## Proposed Urdu body text (for the owner to submit to Meta)

Language: **Urdu (`ur`)**, category UTILITY, no link in the body.

### `ghsoon_najd_sign_request` (`ur`)

```
السلام علیکم {{1}}،
آپ کا وزٹ "{{2}}" مکمل ہو گیا ہے۔ براہِ کرم نیچے دیے گئے بٹن سے کام دیکھیں اور دستخط کریں۔
یہ لنک {{3}} دن تک چالو رہے گا۔
Ghsoon Najd
```

Button: type URL (dynamic), label `دستخط کریں`, URL `https://<host>/sign/{{1}}`.

Sample values for the Meta form: `{{1}}` = `احمد`, `{{2}}` = `اے سی کی دیکھ بھال`, `{{3}}` = `3`.

### `ghsoon_najd_sign_reminder` (`ur`)

```
یاد دہانی: آپ کے وزٹ "{{1}}" پر دستخط ابھی باقی ہیں۔
یہ لنک تقریباً {{2}} گھنٹے میں ختم ہو جائے گا۔ براہِ کرم نیچے دیے گئے بٹن سے دستخط کریں۔
Ghsoon Najd
```

Button: type URL (dynamic), label `دستخط کریں`, URL `https://<host>/sign/{{1}}`.

Sample values: `{{1}}` = `اے سی کی دیکھ بھال`, `{{2}}` = `24`.

These texts follow the glossary in `docs/urdu-glossary.md` (وزٹ, دستخط, کلائنٹ is not used here to keep the message personal). They should be read by a native Urdu speaker before submission, like the rest of the Urdu UI text (`docs/urdu-review.csv`). Check that the wording matches the approved Arabic body in your WhatsApp Manager, since the real Arabic body text is not stored in this repository.
