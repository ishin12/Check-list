-- ============================================================================
-- 0008 — fixes from the 28 Sep 2026 acceptance review (UAT C03, I01, I04)
--
--   C03 / BR-014  project tasks are never deleted. Optional checklist items
--                 are now saved only when the supervisor uses them, so the
--                 old "delete untouched optional items" path is gone.
--   I01 / §9      every establishment stage has a checklist (draft content,
--                 editable by management), and a project cannot move to a
--                 later stage while a required item of the current (or a
--                 skipped) stage is not completed.
--   I04 / BR-008  a completed or closed project takes no new or restarted
--                 visits. (Projects already cannot be deleted — 0006.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C03: no hard delete of project tasks
-- ---------------------------------------------------------------------------
drop policy if exists "ptasks supervisor delete" on public.project_tasks;

create trigger trg_project_tasks_nodelete before delete on public.project_tasks
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------------
-- I04: no visits on a completed / closed project
-- ---------------------------------------------------------------------------
create or replace function public.visits_project_open_guard() returns trigger
language plpgsql as $$
declare
  v_status public.project_status;
begin
  if tg_op = 'INSERT' or (new.status = 'in_progress' and old.status = 'planned') then
    select status into v_status from public.projects where id = new.project_id;
    if v_status in ('completed', 'closed') then
      raise exception 'BR-008: project is % and cannot take new visits', v_status using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_visits_project_open before insert or update on public.visits
  for each row execute function public.visits_project_open_guard();

-- ---------------------------------------------------------------------------
-- I01: stage gate
-- ---------------------------------------------------------------------------

-- Required items of the stage's active checklists that the project has not
-- completed yet.
create or replace function public.stage_missing_items(p_project uuid, p_stage uuid) returns integer
language sql stable as $$
  select count(*)::int
  from public.templates t
  cross join lateral jsonb_array_elements(t.tasks) as item
  where t.stage_id = p_stage
    and t.active
    and coalesce((item ->> 'required')::boolean, false)
    and coalesce(item ->> 'recurrence', 'none') = 'none'
    and not exists (
      select 1 from public.project_tasks pt
      where pt.project_id = p_project
        and pt.template_id = t.id
        and pt.template_item_id = item ->> 'id'
        and pt.status = 'completed');
$$;

create or replace function public.projects_stage_guard() returns trigger
language plpgsql as $$
declare
  v_from int;
  v_to int;
  v_stage record;
begin
  if old.stage_id is null or new.stage_id is null or new.stage_id = old.stage_id then
    return new;
  end if;
  select sort_order into v_from from public.project_stages where id = old.stage_id;
  select sort_order into v_to   from public.project_stages where id = new.stage_id;
  if v_to <= v_from then
    return new;   -- moving back (or sideways) is a management correction, not progress
  end if;
  for v_stage in
    select s.id, coalesce(s.name ->> 'en', s.code) as label
    from public.project_stages s
    where s.project_type_id = new.project_type_id
      and s.sort_order >= v_from and s.sort_order < v_to
    order by s.sort_order
  loop
    if public.stage_missing_items(new.id, v_stage.id) > 0 then
      raise exception 'STAGE-GATE: required checklist items of stage "%" are not completed', v_stage.label
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_projects_stage_guard before update of stage_id on public.projects
  for each row execute function public.projects_stage_guard();

-- Draft checklist for every establishment stage (§9). Management edits these
-- in Checklists; a stage that already has a checklist is left alone.
insert into public.templates (title, tasks, project_type_id, stage_id)
select jsonb_build_object('en', s.name ->> 'en' || ' — stage checklist',
                          'ar', 'قائمة مرحلة ' || (s.name ->> 'ar')),
       c.items::jsonb, s.project_type_id, s.id
from public.project_stages s
join (values
  ('site_handover', '[
    {"id":"sh-receive","order":0,"required":true,"label":{"en":"Site received from the client / contractor","ar":"استلام الموقع من العميل أو المقاول","ur":"کلائنٹ / ٹھیکیدار سے سائٹ کی وصولی"}},
    {"id":"sh-condition","order":1,"required":true,"photoRequired":true,"label":{"en":"Site condition reviewed and photographed","ar":"مراجعة حالة الموقع وتصويرها","ur":"سائٹ کی حالت کا جائزہ اور تصویر"}},
    {"id":"sh-obstacles","order":2,"required":true,"label":{"en":"Notes and obstacles recorded","ar":"تسجيل الملاحظات والعوائق","ur":"نوٹس اور رکاوٹیں درج کریں"}}]'),
  ('preparatory', '[
    {"id":"pr-wool","order":0,"required":false,"label":{"en":"Agricultural wool checked (if used)","ar":"فحص الصوف الزراعي (إن وُجد)","ur":"زرعی اون کا معائنہ (اگر استعمال ہو)"}},
    {"id":"pr-soil","order":1,"required":true,"label":{"en":"Soil checked","ar":"فحص التربة","ur":"مٹی کا معائنہ"}},
    {"id":"pr-basins","order":2,"required":true,"label":{"en":"Basins prepared","ar":"تجهيز الأحواض","ur":"حوضوں کی تیاری"}},
    {"id":"pr-levels","order":3,"required":true,"label":{"en":"Levels checked","ar":"فحص المناسيب","ur":"سطح (لیول) کی جانچ"}}]'),
  ('irrigation', '[
    {"id":"i-test","order":0,"required":true,"photoRequired":true,"label":{"en":"Pressure-test irrigation lines","ar":"اختبار ضغط خطوط الري","ur":"آبپاشی کی لائنوں کا پریشر ٹیسٹ"}},
    {"id":"i-drip","order":1,"required":true,"label":{"en":"Check drip emitters at each basin","ar":"فحص النقاطات عند كل حوض","ur":"ہر حوض پر ڈرپ ایمیٹرز کا معائنہ"}},
    {"id":"i-notes","order":2,"required":true,"label":{"en":"Record defects and fixes needed","ar":"تسجيل الملاحظات والمعالجات المطلوبة","ur":"خرابیاں اور ضروری مرمت درج کریں"}}]'),
  ('planting_ready', '[
    {"id":"rd-soil","order":0,"required":true,"label":{"en":"Soil ready for planting","ar":"التربة جاهزة للزراعة","ur":"مٹی شجرکاری کے لیے تیار"}},
    {"id":"rd-irr","order":1,"required":true,"label":{"en":"Irrigation working and tested","ar":"الري يعمل وتم اختباره","ur":"آبپاشی چل رہی ہے اور ٹیسٹ ہو چکی"}},
    {"id":"rd-site","order":2,"required":true,"label":{"en":"Site ready for planting","ar":"الموقع جاهز للزراعة","ur":"سائٹ شجرکاری کے لیے تیار"}}]'),
  ('planting', '[
    {"id":"pl-plants","order":0,"required":true,"label":{"en":"Plants received match the approved list","ar":"مطابقة النباتات المستلمة للقائمة المعتمدة","ur":"موصولہ پودے منظور شدہ فہرست کے مطابق"}},
    {"id":"pl-exec","order":1,"required":true,"photoRequired":true,"label":{"en":"Planting done per the approved items","ar":"تنفيذ الزراعة حسب البنود المعتمدة","ur":"منظور شدہ نکات کے مطابق شجرکاری"}},
    {"id":"pl-water","order":2,"required":true,"label":{"en":"First watering done","ar":"تنفيذ الري الأول","ur":"پہلی آبپاشی مکمل"}}]'),
  ('handover', '[
    {"id":"ho-inspect","order":0,"required":true,"photoRequired":true,"label":{"en":"Final inspection of the works","ar":"الفحص النهائي للأعمال","ur":"کاموں کا حتمی معائنہ"}},
    {"id":"ho-notes","order":1,"required":true,"label":{"en":"Remaining notes recorded","ar":"تسجيل الملاحظات المتبقية","ur":"باقی نوٹس درج کریں"}},
    {"id":"ho-handover","order":2,"required":true,"label":{"en":"Handed over to the client","ar":"التسليم للعميل","ur":"کلائنٹ کو حوالگی"}}]')
) as c(code, items) on c.code = s.code
where not exists (select 1 from public.templates t where t.stage_id = s.id);
