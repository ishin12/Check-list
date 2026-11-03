/**
 * Draft checklist for each establishment stage (Master Spec §9). The same
 * content is seeded into Postgres by migration 0008; management edits it in
 * Checklists, so the company's approved lists need no code change.
 */
export interface StageChecklistItem {
  id: string;
  required: boolean;
  photoRequired?: boolean;
  label: { en: string; ar: string; ur: string };
}

export const STAGE_CHECKLISTS: Record<string, StageChecklistItem[]> = {
  site_handover: [
    { id: 'sh-receive', required: true, label: { en: 'Site received from the client / contractor', ar: 'استلام الموقع من العميل أو المقاول', ur: 'کلائنٹ / ٹھیکیدار سے سائٹ کی وصولی' } },
    { id: 'sh-condition', required: true, photoRequired: true, label: { en: 'Site condition reviewed and photographed', ar: 'مراجعة حالة الموقع وتصويرها', ur: 'سائٹ کی حالت کا جائزہ اور تصویر' } },
    { id: 'sh-obstacles', required: true, label: { en: 'Notes and obstacles recorded', ar: 'تسجيل الملاحظات والعوائق', ur: 'نوٹس اور رکاوٹیں درج کریں' } },
  ],
  preparatory: [
    { id: 'pr-wool', required: false, label: { en: 'Agricultural wool checked (if used)', ar: 'فحص الصوف الزراعي (إن وُجد)', ur: 'زرعی اون کا معائنہ (اگر استعمال ہو)' } },
    { id: 'pr-soil', required: true, label: { en: 'Soil checked', ar: 'فحص التربة', ur: 'مٹی کا معائنہ' } },
    { id: 'pr-basins', required: true, label: { en: 'Basins prepared', ar: 'تجهيز الأحواض', ur: 'حوضوں کی تیاری' } },
    { id: 'pr-levels', required: true, label: { en: 'Levels checked', ar: 'فحص المناسيب', ur: 'سطح (لیول) کی جانچ' } },
  ],
  irrigation: [
    { id: 'i-test', required: true, photoRequired: true, label: { en: 'Pressure-test irrigation lines', ar: 'اختبار ضغط خطوط الري', ur: 'آبپاشی کی لائنوں کا پریشر ٹیسٹ' } },
    { id: 'i-drip', required: true, label: { en: 'Check drip emitters at each basin', ar: 'فحص النقاطات عند كل حوض', ur: 'ہر حوض پر ڈرپ ایمیٹرز کا معائنہ' } },
    { id: 'i-notes', required: true, label: { en: 'Record defects and fixes needed', ar: 'تسجيل الملاحظات والمعالجات المطلوبة', ur: 'خرابیاں اور ضروری مرمت درج کریں' } },
  ],
  planting_ready: [
    { id: 'rd-soil', required: true, label: { en: 'Soil ready for planting', ar: 'التربة جاهزة للزراعة', ur: 'مٹی شجرکاری کے لیے تیار' } },
    { id: 'rd-irr', required: true, label: { en: 'Irrigation working and tested', ar: 'الري يعمل وتم اختباره', ur: 'آبپاشی چل رہی ہے اور ٹیسٹ ہو چکی' } },
    { id: 'rd-site', required: true, label: { en: 'Site ready for planting', ar: 'الموقع جاهز للزراعة', ur: 'سائٹ شجرکاری کے لیے تیار' } },
  ],
  planting: [
    { id: 'pl-plants', required: true, label: { en: 'Plants received match the approved list', ar: 'مطابقة النباتات المستلمة للقائمة المعتمدة', ur: 'موصولہ پودے منظور شدہ فہرست کے مطابق' } },
    { id: 'pl-exec', required: true, photoRequired: true, label: { en: 'Planting done per the approved items', ar: 'تنفيذ الزراعة حسب البنود المعتمدة', ur: 'منظور شدہ نکات کے مطابق شجرکاری' } },
    { id: 'pl-water', required: true, label: { en: 'First watering done', ar: 'تنفيذ الري الأول', ur: 'پہلی آبپاشی مکمل' } },
  ],
  handover: [
    { id: 'ho-inspect', required: true, photoRequired: true, label: { en: 'Final inspection of the works', ar: 'الفحص النهائي للأعمال', ur: 'کاموں کا حتمی معائنہ' } },
    { id: 'ho-notes', required: true, label: { en: 'Remaining notes recorded', ar: 'تسجيل الملاحظات المتبقية', ur: 'باقی نوٹس درج کریں' } },
    { id: 'ho-handover', required: true, label: { en: 'Handed over to the client', ar: 'التسليم للعميل', ur: 'کلائنٹ کو حوالگی' } },
  ],
};
