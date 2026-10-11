-- =====================================================================
-- White G — Qualification : réception publique (site dzwhiteg.com),
-- relances automatiques et droits d'accès.
-- Les fonctions wg_* ne sont appelables QUE par la fonction serveur
-- wg-intake (clé service) : jamais directement depuis un navigateur.
-- =====================================================================

-- Pré-qualification envoyée depuis le site
create or replace function public.wg_intake_prequal(p jsonb, p_ip_hash text, p_ua text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c jsonb := p->'contact'; a jsonb := p->'answers'; st public.qual_settings; r public.qual_requests; url text; bucket text;
begin
  if (select count(*) from public.qual_requests where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  if (select count(*) from public.qual_requests where lower(email) = lower(c->>'email') and created_at > now() - interval '24 hours') >= 3 then
    return jsonb_build_object('error', 'too_many');
  end if;

  insert into public.qual_requests (first_name, last_name, company_name, role_title, email, phone, whatsapp, wilaya, lang, prequal, source, ip_hash, user_agent)
  values (c->>'first_name', c->>'last_name', nullif(c->>'company_name', ''), nullif(c->>'role_title', ''), lower(c->>'email'),
          c->>'phone', nullif(c->>'whatsapp', ''), nullif(c->>'wilaya', ''), coalesce(nullif(p->>'lang', ''), 'fr'),
          coalesce(a, '{}'::jsonb), nullif(a->>'source', ''), p_ip_hash, left(p_ua, 300))
  returning * into r;
  perform private.qual_log(r.id, 'created', jsonb_build_object('grade', r.grade, 'score', r.score));

  select * into st from public.qual_settings where id = 1;
  if r.grade = any(st.auto_invite_grades) then
    url := private.qual_issue_fiche(r.id);
    perform private.qual_log(r.id, 'fiche_auto_invited', jsonb_build_object('url', url));
    bucket := 'fiche';
  elsif r.grade = 'D' then
    bucket := 'decline';
  else
    bucket := 'review';
  end if;

  perform public.notify_members('lead',
    case r.grade when 'A' then '🔥 ' else '' end || 'Nouvelle demande [' || r.grade || '] : ' || coalesce(r.company_name, r.first_name || ' ' || r.last_name),
    'Score ' || r.score || '/100 · ' || private.qual_project_label(a->>'project_type') || ' · ' || private.qual_format_label(a->>'format')
      || case when bucket = 'fiche' then ' · fiche envoyée automatiquement' else ' · à trier' end,
    '/qualification/' || r.id);

  return jsonb_build_object('ok', true, 'reference', r.reference, 'next', bucket, 'fiche_url', url);
end $$;

-- Lecture de la fiche par le client (lien personnel)
create or replace function public.wg_fiche_get(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests; st public.qual_settings;
begin
  if coalesce(length(p_token), 0) < 20 then return jsonb_build_object('error', 'not_found'); end if;
  select * into r from public.qual_requests where fiche_token = p_token and not archived;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.fiche_submitted_at is null and r.fiche_expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  if r.fiche_opened_at is null then
    update public.qual_requests set fiche_opened_at = now() where id = r.id;
    perform private.qual_log(r.id, 'fiche_opened', '{}'::jsonb);
  end if;
  select * into st from public.qual_settings where id = 1;
  return jsonb_build_object(
    'reference', r.reference,
    'status', case when r.fiche_submitted_at is not null then 'submitted' else 'open' end,
    'submitted_at', r.fiche_submitted_at,
    'contact', jsonb_build_object('first_name', r.first_name, 'last_name', r.last_name, 'company_name', r.company_name,
                                  'role_title', r.role_title, 'email', r.email, 'phone', r.phone, 'whatsapp', r.whatsapp, 'wilaya', r.wilaya),
    'prefill', r.prequal, 'answers', r.fiche, 'progress', r.fiche_progress,
    'rd', jsonb_build_object('fee_dzd', st.rd_fee_dzd, 'credit_months', st.rd_credit_months, 'samples', st.rd_samples_included));
end $$;

-- Sauvegarde (brouillon) ou envoi définitif de la fiche
create or replace function public.wg_fiche_save(p_token text, p_answers jsonb, p_progress integer, p_submit boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests;
begin
  if coalesce(length(p_token), 0) < 20 then return jsonb_build_object('error', 'not_found'); end if;
  select * into r from public.qual_requests where fiche_token = p_token and not archived for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if r.fiche_submitted_at is not null then return jsonb_build_object('error', 'already_submitted'); end if;
  if r.fiche_expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  if p_submit and not (coalesce((p_answers->>'confirm_accurate')::boolean, false) and coalesce((p_answers->>'confirm_callback')::boolean, false)) then
    return jsonb_build_object('error', 'confirmations_required');
  end if;

  update public.qual_requests
     set fiche = coalesce(p_answers, '{}'::jsonb),
         fiche_progress = greatest(0, least(100, coalesce(p_progress, 0))),
         fiche_saved_at = now(),
         fiche_submitted_at = case when p_submit then now() else null end,
         company_name = coalesce(nullif(p_answers->>'company_name', ''), company_name),
         role_title = coalesce(nullif(p_answers->>'role_title', ''), role_title),
         whatsapp = coalesce(nullif(p_answers->>'whatsapp', ''), whatsapp),
         wilaya = coalesce(nullif(p_answers->>'wilaya', ''), wilaya)
   where id = r.id returning * into r;

  if p_submit then
    perform private.qual_ensure_crm(r.id);
    select * into r from public.qual_requests where id = r.id;
    update public.clients c set
      rc_number = coalesce(c.rc_number, nullif(p_answers->>'rc_number', '')),
      nif = coalesce(c.nif, nullif(p_answers->>'nif', '')),
      address = coalesce(c.address, nullif(p_answers->>'address', '')),
      website = coalesce(c.website, nullif(p_answers->>'website', ''))
    where c.id = r.client_id;
    update public.deals set stage = 'brief' where id = r.deal_id and stage in ('nouveau', 'fiche_envoyee');
    perform private.qual_log(r.id, 'fiche_submitted', jsonb_build_object('progress', r.fiche_progress, 'grade', r.grade, 'score', r.score));
    perform public.notify_members('lead',
      '📋 Fiche reçue [' || r.grade || '] : ' || coalesce(r.company_name, r.first_name || ' ' || r.last_name),
      'Score ' || r.score || '/100 · fiche remplie à ' || r.fiche_progress || ' % — appel de cadrage à planifier',
      '/qualification/' || r.id);
  end if;
  return jsonb_build_object('ok', true, 'reference', r.reference, 'submitted', p_submit);
end $$;

-- Relances automatiques (jours ouvrés, 9 h)
create or replace function public.qual_send_nudges()
returns integer language plpgsql security definer set search_path = '' as $$
declare x record; n integer := 0;
begin
  for x in
    select q.id, coalesce(q.company_name, q.first_name || ' ' || q.last_name) who, k.kind, k.title, k.body
    from public.qual_requests q
    cross join lateral (values
      ('fiche_wait', 'Fiche non remplie : ', 'Lien envoyé il y a plus de 4 jours — relancez par WhatsApp',
         q.fiche_sent_at is not null and q.fiche_submitted_at is null and q.fiche_sent_at < now() - interval '4 days' and q.decision = 'en_attente'),
      ('to_call', 'Appel de cadrage à faire : ', 'Fiche reçue depuis plus de 2 jours sans décision',
         q.fiche_submitted_at is not null and q.decision = 'en_attente' and q.fiche_submitted_at < now() - interval '2 days'),
      ('to_sort', 'Demande à trier : ', 'Note ' || q.grade || ' en attente depuis plus de 3 jours — inviter à la fiche ou archiver',
         q.fiche_sent_at is null and q.decision = 'en_attente' and q.grade in ('B', 'C') and q.created_at < now() - interval '3 days'),
      ('rd_late', 'R&D longue : ', 'Frais d''étude encaissés il y a plus de 21 jours, formule non livrée',
         q.rd_fee_paid_on is not null and q.formula_delivered_at is null and q.rd_fee_paid_on < current_date - 21)
    ) as k(kind, title, body, due)
    where not q.archived and k.due
      and not exists (select 1 from public.notifications nn where nn.kind = 'followup' and nn.link = '/qualification/' || q.id
                        and nn.title like k.title || '%' and nn.created_at > now() - interval '4 days')
    order by q.priority desc
    limit 20
  loop
    perform public.notify_members('followup', x.title || x.who, x.body, '/qualification/' || x.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Droits ----------
revoke all on function public.wg_intake_prequal(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.wg_fiche_get(text) from public, anon, authenticated;
revoke all on function public.wg_fiche_save(text, jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.wg_intake_prequal(jsonb, text, text) to service_role;
grant execute on function public.wg_fiche_get(text) to service_role;
grant execute on function public.wg_fiche_save(text, jsonb, integer, boolean) to service_role;

revoke all on function public.qual_invite(uuid) from public, anon;
revoke all on function public.qual_decide(uuid, text, text, jsonb) from public, anon;
revoke all on function public.qual_record_rd(uuid, numeric, date, text, date) from public, anon;
revoke all on function public.qual_formula(uuid, boolean, text) from public, anon;
revoke all on function public.qual_final_quote(uuid) from public, anon;
revoke all on function public.qual_archive(uuid, boolean) from public, anon;
revoke all on function public.qual_send_nudges() from public, anon, authenticated;
grant execute on function public.qual_invite(uuid) to authenticated;
grant execute on function public.qual_decide(uuid, text, text, jsonb) to authenticated;
grant execute on function public.qual_record_rd(uuid, numeric, date, text, date) to authenticated;
grant execute on function public.qual_formula(uuid, boolean, text) to authenticated;
grant execute on function public.qual_final_quote(uuid) to authenticated;
grant execute on function public.qual_archive(uuid, boolean) to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'qual-nudges';
select cron.schedule('qual-nudges', '5 8 * * 0-4', $$select public.qual_send_nudges()$$);
