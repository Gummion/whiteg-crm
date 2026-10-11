-- =====================================================================
-- White G — Système de qualification (prise de contact → fiche → R&D → devis final)
-- Projet Supabase : whiteg-crm. Toutes les tables sont préfixées qual_.
-- Source unique de vérité : le score, la note (A-D), les alertes et la
-- priorité sont calculés ICI, en base, à chaque modification d'un dossier.
-- =====================================================================

-- ---------- 1. Libellés et automatismes du pipeline ----------
create or replace function public.stage_label(s public.deal_stage)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'nouveau' then 'Contact reçu'
    when 'fiche_envoyee' then 'Fiche envoyée'
    when 'brief' then 'Fiche reçue'
    when 'cadrage' then 'Appel de cadrage'
    when 'rd_en_cours' then 'R&D en cours'
    when 'formule_livree' then 'Formule livrée'
    when 'devis_envoye' then 'Devis final envoyé'
    when 'negociation' then 'Négociation'
    when 'acompte_recu' then 'Acompte reçu'
    when 'en_cours' then 'En production'
    when 'livre' then 'Livré'
    when 'perdu' then 'Perdu' end;
$$;

create or replace function public.deal_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cname text;
begin
  select company_name into cname from public.clients where id = new.client_id;
  if tg_op = 'INSERT' then
    perform public.notify_members('deal', 'Nouvelle opportunité : ' || new.title, cname || ' · ' || to_char(new.amount, 'FM999G999G999') || ' DA', '/pipeline?deal=' || new.id, auth.uid());
    insert into public.activities(client_id, deal_id, type, subject, author_id)
    values (new.client_id, new.id, 'note', 'Opportunité créée : ' || new.title, auth.uid());
  elsif new.stage is distinct from old.stage then
    perform public.notify_members(
      case when new.stage = 'livre' then 'won' when new.stage = 'perdu' then 'lost' else 'deal' end,
      new.title || ' → ' || public.stage_label(new.stage),
      cname || ' · ' || public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage),
      '/pipeline?deal=' || new.id, auth.uid());
    insert into public.activities(client_id, deal_id, type, subject, author_id)
    values (new.client_id, new.id,
            case when new.stage = 'acompte_recu' then 'paiement'::public.activity_type
                 when new.stage = 'devis_envoye' then 'devis'::public.activity_type
                 else 'note'::public.activity_type end,
            'Étape : ' || public.stage_label(old.stage) || ' → ' || public.stage_label(new.stage), auth.uid());
    if new.stage in ('acompte_recu', 'en_cours', 'livre') then
      update public.clients set status = 'client' where id = new.client_id and status <> 'client';
    elsif new.stage in ('fiche_envoyee', 'brief', 'cadrage', 'rd_en_cours', 'formule_livree', 'devis_envoye', 'negociation') then
      update public.clients set status = 'lead' where id = new.client_id and status = 'prospect';
    end if;
  end if;
  return new;
end $$;

-- Un paiement ne fait passer en « Acompte reçu » que hors phase d'étude :
-- les frais d'étude R&D (étapes cadrage / R&D en cours) ne sont PAS un acompte de production.
create or replace function public.payment_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare doc uuid := coalesce(new.document_id, old.document_id); paid numeric; ttc numeric; did uuid;
begin
  if doc is not null then
    select coalesce(sum(amount), 0) into paid from public.payments where document_id = doc;
    select total_ttc, deal_id into ttc, did from public.documents where id = doc;
    update public.documents set amount_paid = paid,
      status = case when paid >= ttc and ttc > 0 then 'paye' when paid > 0 then 'partiel' when status in ('paye', 'partiel') then 'emis' else status end
    where id = doc;
  end if;
  if tg_op = 'INSERT' then
    did := coalesce(new.deal_id, did);
    if did is not null then
      update public.deals set stage = 'acompte_recu', deposit_paid = true, deposit_amount = greatest(deposit_amount, new.amount)
      where id = did and stage in ('nouveau', 'fiche_envoyee', 'brief', 'formule_livree', 'devis_envoye', 'negociation');
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- ---------- 2. Réglages ----------
create table if not exists public.qual_settings (
  id integer primary key default 1 check (id = 1),
  rd_fee_dzd integer check (rd_fee_dzd is null or rd_fee_dzd >= 0),
  rd_credit_months integer not null default 6 check (rd_credit_months between 1 and 36),
  rd_samples_included integer not null default 3 check (rd_samples_included between 1 and 10),
  inhouse_formats text[] not null default array['gummies', 'gelule', 'stick_poudre', 'stick_liquide', 'sirop', 'ampoule'],
  moq jsonb not null default '{}'::jsonb,            -- {"gummies": 5000, ...} — vide = contrôle désactivé
  unit_cost_dzd jsonb not null default '{}'::jsonb,  -- coût unitaire indicatif par format — vide = contrôle désactivé
  grade_a integer not null default 75,
  grade_b integer not null default 55,
  grade_c integer not null default 35,
  auto_invite_grades text[] not null default array['A', 'B'],
  site_url text not null default 'https://www.dzwhiteg.com',
  fiche_valid_days integer not null default 60 check (fiche_valid_days between 7 and 365),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (grade_a > grade_b and grade_b > grade_c and grade_c > 0 and grade_a <= 100)
);
insert into public.qual_settings (id) values (1) on conflict (id) do nothing;

-- ---------- 3. Dossiers de qualification ----------
create sequence if not exists private.qual_ref_seq;

create table if not exists public.qual_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('WG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('private.qual_ref_seq')::text, 4, '0')),
  -- contact
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  company_name text check (length(company_name) <= 160),
  role_title text check (length(role_title) <= 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone text not null check (length(phone) between 6 and 30),
  whatsapp text check (length(whatsapp) <= 30),
  wilaya text check (length(wilaya) <= 60),
  lang text not null default 'fr' check (lang in ('fr', 'ar', 'en')),
  -- réponses
  prequal jsonb not null default '{}'::jsonb,
  fiche jsonb not null default '{}'::jsonb,
  -- fiche de commande en ligne
  fiche_token text unique,
  fiche_sent_at timestamptz,
  fiche_expires_at timestamptz,
  fiche_opened_at timestamptz,
  fiche_saved_at timestamptz,
  fiche_submitted_at timestamptz,
  fiche_progress integer not null default 0 check (fiche_progress between 0 and 100),
  -- calcul (rempli automatiquement)
  score integer not null default 0,
  grade text not null default 'D' check (grade in ('A', 'B', 'C', 'D')),
  score_detail jsonb not null default '{}'::jsonb,
  red_flags jsonb not null default '[]'::jsonb,
  priority integer not null default 0,
  est_value_dzd numeric,
  -- liens CRM
  client_id uuid references public.clients(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  -- décision après appel de cadrage
  decision text not null default 'en_attente' check (decision in ('en_attente', 'go', 'no_go')),
  decision_reason text,
  decided_at timestamptz,
  decided_by uuid,
  call_grid jsonb not null default '{}'::jsonb,
  call_at timestamptz,
  -- engagement R&D
  rd_fee_dzd numeric,
  rd_fee_paid_on date,
  rd_credit_until date,
  rd_payment_id uuid references public.payments(id) on delete set null,
  nda_signed_on date,
  samples_round integer not null default 0,
  formula_delivered_at timestamptz,
  final_quote_sent_at timestamptz,
  -- suivi
  archived boolean not null default false,
  source text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qual_requests_priority_idx on public.qual_requests (archived, priority desc, created_at desc);
create index if not exists qual_requests_email_idx on public.qual_requests (lower(email), created_at desc);
create index if not exists qual_requests_ip_idx on public.qual_requests (ip_hash, created_at desc);
create index if not exists qual_requests_deal_idx on public.qual_requests (deal_id);

create table if not exists public.qual_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.qual_requests(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists qual_events_request_idx on public.qual_events (request_id, created_at desc);

-- ---------- 4. Calcul du score (source unique) ----------
create or replace function public.qual_score(p_pre jsonb, p_fiche jsonb, p_progress integer, p_submitted boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  st public.qual_settings;
  f jsonb;
  m jsonb;
  budget text; maturity text; ptype text; fmt text; cat text; entity text; rec text; tri text; rd_ok text;
  qband text; qlow integer; qhigh integer; launch text; descr text; email text;
  months numeric;
  p_fin integer := 0; p_mat integer := 0; p_vol integer := 0; p_adq integer := 0; p_ser integer := 0;
  pen integer := 0; total integer; grade text; urgency integer := 0; prio integer;
  flags jsonb := '[]'::jsonb; has_high boolean := false;
  custom boolean; moq_v numeric; cost_v numeric; budget_high numeric; est numeric;
begin
  select * into st from public.qual_settings where id = 1;
  -- la fiche remplace la pré-qualification, mais une réponse vide ne l'écrase pas
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into f
  from jsonb_each(coalesce(p_fiche, '{}'::jsonb))
  where value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb);
  m := coalesce(p_pre, '{}'::jsonb) || f;

  budget := m->>'budget'; maturity := m->>'maturity'; ptype := m->>'project_type';
  fmt := m->>'format'; cat := m->>'category'; entity := m->>'entity'; rec := m->>'recurrence';
  tri := m->>'trilemma'; rd_ok := m->>'rd_ok';
  descr := coalesce(nullif(m->>'description', ''), m->>'c_what', '');
  email := coalesce(m->>'_email', '');
  custom := ptype in ('sur_mesure', 'reformulation', 'pack_lancement');

  -- quantité du premier lot : chiffre exact de la fiche, sinon tranche
  if coalesce(m->>'first_batch_qty', '') ~ '^\d{1,9}$' then
    qlow := (m->>'first_batch_qty')::integer; qhigh := qlow;
    qband := case when qlow < 1000 then 'lt1k' when qlow < 5000 then '1k_5k' when qlow < 20000 then '5k_20k'
                  when qlow < 100000 then '20k_100k' else 'gt100k' end;
  else
    qband := m->>'qty_band';
    qlow := case qband when 'lt1k' then 1 when '1k_5k' then 1000 when '5k_20k' then 5000 when '20k_100k' then 20000 when 'gt100k' then 100000 end;
    qhigh := case qband when 'lt1k' then 999 when '1k_5k' then 4999 when '5k_20k' then 19999 when '20k_100k' then 99999 when 'gt100k' then 1000000000 end;
  end if;

  -- date de lancement : date exacte de la fiche, sinon tranche
  if coalesce(m->>'launch_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    months := ((m->>'launch_date')::date - current_date) / 30.0;
    launch := case when months < 3 then 'lt3m' when months < 6 then '3_6m' when months < 12 then '6_12m' else 'gt12m' end;
  else
    launch := m->>'launch';
  end if;

  -- Capacité financière /25
  p_fin := case budget when 'lt300k' then 3 when '300k_1m' then 10 when '1m_5m' then 18 when '5m_20m' then 23 when 'gt20m' then 25 when 'a_discuter' then 8 else 0 end;
  if (m->>'funding') in ('fonds_propres', 'investisseur') then p_fin := least(25, p_fin + 2); end if;

  -- Maturité /20
  p_mat := case maturity when 'idee' then 4 when 'etude' then 10 when 'pret' then 17 when 'marche' then 20 else 0 end;
  if (m->>'trademark') in ('deposee', 'en_cours') then p_mat := p_mat + 2; end if;
  if (m->>'formula_level') = 'complete' then p_mat := p_mat + 2; elsif (m->>'formula_level') = 'actifs' then p_mat := p_mat + 1; end if;
  p_mat := least(20, p_mat);

  -- Volume & récurrence /20
  p_vol := case qband when 'lt1k' then 2 when '1k_5k' then 8 when '5k_20k' then 13 when '20k_100k' then 16 when 'gt100k' then 17 when 'nsp' then 4 else 0 end
         + case rec when 'mensuelle' then 3 when 'trimestrielle' then 2 when 'a_la_demande' then 1 else 0 end;
  p_vol := least(20, p_vol);

  -- Adéquation White G /20
  p_adq := case when fmt is null or fmt = '' then 0
                when fmt = any(st.inhouse_formats) then 12
                when fmt = 'ne_sait_pas' then 7 else 5 end
         + case cat when 'complement' then 4 when 'agro' then 3 when 'mixte' then 2 when 'cosmetique' then 2 else 0 end
         + case ptype when 'sur_mesure' then 4 when 'pack_lancement' then 4 when 'reformulation' then 4 when 'catalogue' then 3 when 'lot_pilote' then 3 when 'ne_sait_pas' then 1 else 0 end;
  p_adq := least(20, p_adq);

  -- Sérieux & engagement /15
  p_ser := case entity when 'sarl_eurl_spa' then 6 when 'startup' then 4 when 'auto_entrepreneur' then 3 when 'autre' then 2 when 'particulier' then 1 else 0 end
         + case when (m->>'decision_maker') = 'oui' then 3 else 0 end
         + case when length(descr) >= 150 then 2 when length(descr) >= 50 then 1 else 0 end
         + case when email <> '' and split_part(lower(email), '@', 2) not in
                  ('gmail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'live.fr', 'live.com', 'icloud.com', 'ymail.com', 'aol.com', 'msn.com')
                then 1 else 0 end
         + case when coalesce(m->>'rc_number', '') <> '' then 2 else 0 end
         + case when coalesce(m->>'nif', '') <> '' then 1 else 0 end
         + case when p_submitted and coalesce(p_progress, 0) >= 80 then 2 else 0 end;
  p_ser := least(15, p_ser);

  -- Alertes
  if custom and rd_ok = 'non' then
    pen := pen + 15; has_high := true;
    flags := flags || jsonb_build_object('code', 'NO_RD', 'severity', 'high', 'label', 'Refuse l''étude R&D payante pour un projet sur-mesure');
  elsif custom and rd_ok = 'a_discuter' then
    pen := pen + 3;
    flags := flags || jsonb_build_object('code', 'RD_DOUBT', 'severity', 'low', 'label', 'Hésite sur l''étude R&D payante');
  end if;

  if tri = 'prix' and (budget = 'lt300k' or (maturity = 'idee' and budget = 'a_discuter')) then
    pen := pen + 10;
    flags := flags || jsonb_build_object('code', 'PRICE_HUNTER', 'severity', 'medium', 'label', 'Priorité au prix avec un budget faible ou non défini');
  end if;

  if launch = 'aucune' and maturity = 'idee' then
    pen := pen + 5;
    flags := flags || jsonb_build_object('code', 'NO_TIMELINE', 'severity', 'low', 'label', 'Idée sans date de lancement');
  end if;

  if entity = 'particulier' and maturity = 'idee' then
    pen := pen + 3;
    flags := flags || jsonb_build_object('code', 'INDIVIDUAL_IDEA', 'severity', 'low', 'label', 'Particulier au stade de l''idée');
  end if;

  if (m->>'decision_maker') = 'non' then
    flags := flags || jsonb_build_object('code', 'NOT_DM', 'severity', 'low', 'label', 'L''interlocuteur n''est pas le décisionnaire');
  end if;

  if fmt is not null and st.moq ? fmt and qhigh is not null then
    moq_v := nullif(st.moq->>fmt, '')::numeric;
    if moq_v is not null and qhigh < moq_v then
      pen := pen + 8; has_high := true;
      flags := flags || jsonb_build_object('code', 'BELOW_MOQ', 'severity', 'high',
        'label', 'Premier lot sous le minimum de production (' || to_char(moq_v, 'FM999G999G999') || ' unités)');
    end if;
  end if;

  budget_high := case budget when 'lt300k' then 300000 when '300k_1m' then 1000000 when '1m_5m' then 5000000 when '5m_20m' then 20000000 end;
  if fmt is not null and st.unit_cost_dzd ? fmt and qlow is not null and budget_high is not null then
    cost_v := nullif(st.unit_cost_dzd->>fmt, '')::numeric;
    if cost_v is not null and budget_high < qlow * cost_v * 0.6 then
      pen := pen + 8;
      flags := flags || jsonb_build_object('code', 'BUDGET_LOW', 'severity', 'medium',
        'label', 'Budget insuffisant pour le volume (coût estimé ≈ ' || to_char(qlow * cost_v, 'FM999G999G999') || ' DA)');
    end if;
  end if;

  if (m->>'copy_stance') = 'copie_exacte' then
    pen := pen + 10; has_high := true;
    flags := flags || jsonb_build_object('code', 'COPY', 'severity', 'high', 'label', 'Veut une copie exacte d''un produit existant');
  end if;

  if coalesce(m->>'claims', '') ~* '(gu[ée]ri|soign|traite(ment)?\M|cancer|diab[eè]t|covid|hypertension|remplace.{0,20}m[ée]dicament|miracle|100 ?%)' then
    pen := pen + 2;
    flags := flags || jsonb_build_object('code', 'CLAIMS', 'severity', 'medium', 'label', 'Allégation à caractère thérapeutique à vérifier');
  end if;

  total := greatest(0, least(100, p_fin + p_mat + p_vol + p_adq + p_ser - pen));
  grade := case when total >= st.grade_a then 'A' when total >= st.grade_b then 'B' when total >= st.grade_c then 'C' else 'D' end;
  if has_high and grade in ('A', 'B') then grade := 'C'; end if;

  urgency := case launch when 'lt3m' then 10 when '3_6m' then 6 when '6_12m' then 3 when 'gt12m' then 0 when 'aucune' then -3 else 0 end;
  prio := total + urgency + case when p_submitted then 5 else 0 end;
  est := case budget when 'lt300k' then 150000 when '300k_1m' then 650000 when '1m_5m' then 3000000 when '5m_20m' then 12500000 when 'gt20m' then 20000000 end;

  return jsonb_build_object(
    'score', total, 'grade', grade, 'priority', prio, 'est_value', est, 'flags', flags,
    'detail', jsonb_build_object('finance', p_fin, 'maturite', p_mat, 'volume', p_vol, 'adequation', p_adq,
                                 'serieux', p_ser, 'penalites', pen, 'urgence', urgency,
                                 'qty_band', qband, 'launch', launch));
end $$;

create or replace function private.qual_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public.qual_score(new.prequal || jsonb_build_object('_email', new.email), new.fiche, new.fiche_progress, new.fiche_submitted_at is not null);
  new.score := (r->>'score')::integer;
  new.grade := r->>'grade';
  new.priority := (r->>'priority')::integer;
  new.est_value_dzd := nullif(r->>'est_value', '')::numeric;
  new.red_flags := r->'flags';
  new.score_detail := r->'detail';
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists qual_requests_before_write on public.qual_requests;
create trigger qual_requests_before_write before insert or update on public.qual_requests
  for each row execute function private.qual_before_write();

-- Quand les réglages changent, tous les dossiers ouverts sont recalculés
create or replace function private.qual_settings_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.qual_requests set updated_at = now() where not archived;
  return new;
end $$;
drop trigger if exists qual_settings_after_update on public.qual_settings;
create trigger qual_settings_after_update after update on public.qual_settings
  for each row execute function private.qual_settings_after_update();

create or replace function private.qual_settings_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); new.id := 1; return new; end $$;
drop trigger if exists qual_settings_touch on public.qual_settings;
create trigger qual_settings_touch before update on public.qual_settings
  for each row execute function private.qual_settings_touch();

-- ---------- 5. Sécurité (RLS) ----------
alter table public.qual_settings enable row level security;
alter table public.qual_requests enable row level security;
alter table public.qual_events enable row level security;

drop policy if exists "members read" on public.qual_settings;
create policy "members read" on public.qual_settings for select using ((select private.is_crm_member()));
drop policy if exists "admin update" on public.qual_settings;
create policy "admin update" on public.qual_settings for update using ((select private.is_crm_admin())) with check ((select private.is_crm_admin()));

drop policy if exists "members full access" on public.qual_requests;
create policy "members full access" on public.qual_requests for all using ((select private.is_crm_member())) with check ((select private.is_crm_member()));

drop policy if exists "members read" on public.qual_events;
create policy "members read" on public.qual_events for select using ((select private.is_crm_member()));
drop policy if exists "members insert" on public.qual_events;
create policy "members insert" on public.qual_events for insert with check ((select private.is_crm_member()));

revoke all on public.qual_settings, public.qual_requests, public.qual_events from anon;
revoke all on function public.qual_score(jsonb, jsonb, integer, boolean) from public, anon;
grant execute on function public.qual_score(jsonb, jsonb, integer, boolean) to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.qual_requests;
exception when duplicate_object then null; end $$;
