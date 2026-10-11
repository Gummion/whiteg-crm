-- =====================================================================
-- White G — Qualification : actions du CRM et réception publique
-- Toutes les règles de passage d'étape sont ici, en base.
-- =====================================================================

create or replace function public.stage_label(s public.deal_stage)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'nouveau' then 'Contact reçu'
    when 'fiche_envoyee' then 'Fiche envoyée'
    when 'brief' then 'Fiche reçue'
    when 'cadrage' then 'Cadrage validé'
    when 'rd_en_cours' then 'R&D en cours'
    when 'formule_livree' then 'Formule livrée'
    when 'devis_envoye' then 'Devis final envoyé'
    when 'negociation' then 'Négociation'
    when 'acompte_recu' then 'Acompte reçu'
    when 'en_cours' then 'En production'
    when 'livre' then 'Livré'
    when 'perdu' then 'Perdu' end;
$$;

-- ---------- Outils internes ----------
create or replace function private.qual_log(p_id uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.qual_events (request_id, kind, detail, actor_id) values (p_id, p_kind, coalesce(p_detail, '{}'::jsonb), auth.uid());
$$;

create or replace function private.qual_need_member()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_crm_member() then raise exception 'Accès réservé à l''équipe White G' using errcode = '42501'; end if;
end $$;

create or replace function private.qual_format_label(p text)
returns text language sql immutable set search_path = '' as $$
  select case p
    when 'gummies' then 'Gummies' when 'gelule' then 'Gélules' when 'comprime' then 'Comprimés'
    when 'stick_poudre' then 'Sticks' when 'stick_liquide' then 'Sticks'
    when 'sirop' then 'Liquides' when 'ampoule' then 'Liquides' when 'boisson' then 'Liquides' when 'spray_buccal' then 'Liquides'
    when 'poudre_pot' then 'Poudres' when 'sachet_effervescent' then 'Poudres'
    when 'creme' then 'Cosmétique' when 'serum' then 'Cosmétique' when 'huile_lotion' then 'Cosmétique'
    when 'roll_on' then 'Cosmétique' when 'savon' then 'Cosmétique'
    else 'Autre' end;
$$;

create or replace function private.qual_project_label(p text)
returns text language sql immutable set search_path = '' as $$
  select case p
    when 'catalogue' then 'Marque blanche catalogue' when 'sur_mesure' then 'Formule sur-mesure'
    when 'reformulation' then 'Reformulation' when 'pack_lancement' then 'Pack lancement clé en main'
    when 'lot_pilote' then 'Lot pilote' else 'Projet à qualifier' end;
$$;

-- Crée (une seule fois) le client, le contact et l'opportunité liés au dossier
create or replace function private.qual_ensure_crm(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests; m jsonb; cid uuid; v_contact uuid; did uuid; who text;
begin
  select * into r from public.qual_requests where id = p_id for update;
  if not found then raise exception 'Dossier introuvable'; end if;
  m := r.prequal || (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(r.fiche)
                      where value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb, '{}'::jsonb));
  who := trim(r.first_name || ' ' || r.last_name);
  cid := r.client_id;

  if cid is null then
    select c.id into cid from public.clients c
    where lower(c.email) = lower(r.email)
       or exists (select 1 from public.contacts k where k.client_id = c.id and lower(k.email) = lower(r.email))
    order by c.created_at limit 1;
  end if;

  if cid is null then
    insert into public.clients (company_name, sector, status, source, wilaya, phone, email, website, rc_number, nif, address, notes, external_source, external_id)
    values (
      coalesce(nullif(r.company_name, ''), who),
      case m->>'category' when 'complement' then 'nutraceutique' when 'cosmetique' then 'cosmetique' when 'agro' then 'agroalimentaire' else 'autre' end::public.client_sector,
      'lead',
      case r.source when 'recommandation' then 'recommandation' when 'reseaux_sociaux' then 'reseaux_sociaux' when 'salon' then 'salon'
                    when 'whatsapp' then 'whatsapp' else 'site_web' end::public.lead_source,
      r.wilaya, r.phone, r.email, nullif(m->>'website', ''), nullif(m->>'rc_number', ''), nullif(m->>'nif', ''), nullif(m->>'address', ''),
      nullif(m->>'description', ''), 'wg-qualification', r.reference)
    on conflict (external_source, external_id) do update set phone = coalesce(public.clients.phone, excluded.phone)
    returning id into cid;
  end if;

  v_contact := r.contact_id;
  if v_contact is null then
    select k.id into v_contact from public.contacts k where k.client_id = cid and lower(k.email) = lower(r.email) limit 1;
    if v_contact is null then
      insert into public.contacts (client_id, full_name, job_title, phone, whatsapp, email, is_primary)
      values (cid, who, r.role_title, r.phone, coalesce(r.whatsapp, r.phone), r.email,
              not exists (select 1 from public.contacts k where k.client_id = cid and k.is_primary))
      returning id into v_contact;
    end if;
  end if;

  did := r.deal_id;
  if did is null then
    insert into public.deals (client_id, title, category, product_format, stage, amount, probability, notes)
    values (cid,
            r.reference || ' · ' || private.qual_project_label(m->>'project_type') || ' · ' || private.qual_format_label(m->>'format'),
            case m->>'project_type' when 'catalogue' then 'D' when 'lot_pilote' then 'D' when 'pack_lancement' then 'F' else 'B' end::public.offer_category,
            private.qual_format_label(m->>'format'), 'nouveau', coalesce(r.est_value_dzd, 0), 10,
            nullif(m->>'description', ''))
    returning id into did;
  end if;

  update public.qual_requests set client_id = cid, contact_id = v_contact, deal_id = did where id = p_id;
end $$;

-- Génère le lien personnel de fiche et passe l'opportunité en « Fiche envoyée »
create or replace function private.qual_issue_fiche(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests; st public.qual_settings; tok text;
begin
  perform private.qual_ensure_crm(p_id);
  select * into r from public.qual_requests where id = p_id for update;
  select * into st from public.qual_settings where id = 1;
  tok := coalesce(r.fiche_token, translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_'));
  update public.qual_requests
     set fiche_token = tok, fiche_sent_at = coalesce(fiche_sent_at, now()),
         fiche_expires_at = greatest(coalesce(fiche_expires_at, now()), now() + make_interval(days => st.fiche_valid_days))
   where id = p_id;
  update public.deals set stage = 'fiche_envoyee' where id = r.deal_id and stage = 'nouveau';
  return rtrim(st.site_url, '/') || '/fiche/' || tok;
end $$;

-- ---------- Actions de l'équipe (CRM) ----------
create or replace function public.qual_invite(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare url text;
begin
  perform private.qual_need_member();
  url := private.qual_issue_fiche(p_id);
  perform private.qual_log(p_id, 'fiche_invited', jsonb_build_object('url', url));
  return url;
end $$;

create or replace function public.qual_decide(p_id uuid, p_decision text, p_reason text, p_grid jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests;
begin
  perform private.qual_need_member();
  if p_decision not in ('go', 'no_go', 'en_attente') then raise exception 'Décision invalide'; end if;
  if p_decision = 'no_go' and coalesce(trim(p_reason), '') = '' then raise exception 'Indiquez la raison du No-Go'; end if;
  update public.qual_requests
     set decision = p_decision, decision_reason = nullif(trim(p_reason), ''), call_grid = coalesce(p_grid, '{}'::jsonb),
         call_at = coalesce(call_at, now()),
         decided_at = case when p_decision = 'en_attente' then null else now() end,
         decided_by = case when p_decision = 'en_attente' then null else auth.uid() end
   where id = p_id returning * into r;
  if not found then raise exception 'Dossier introuvable'; end if;
  if p_decision = 'go' then
    perform private.qual_ensure_crm(p_id);
    select * into r from public.qual_requests where id = p_id;
    update public.deals set stage = 'cadrage' where id = r.deal_id and stage in ('nouveau', 'fiche_envoyee', 'brief');
  elsif p_decision = 'no_go' and r.deal_id is not null then
    update public.deals set stage = 'perdu', lost_reason = 'No-Go cadrage : ' || trim(p_reason)
     where id = r.deal_id and stage not in ('acompte_recu', 'en_cours', 'livre');
  end if;
  perform private.qual_log(p_id, 'decision', jsonb_build_object('decision', p_decision, 'reason', p_reason));
end $$;

create or replace function public.qual_record_rd(p_id uuid, p_amount numeric, p_paid_on date, p_method text, p_nda_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests; st public.qual_settings; pid uuid;
begin
  perform private.qual_need_member();
  if p_amount is null or p_amount < 0 then raise exception 'Montant invalide'; end if;
  if p_paid_on is null then raise exception 'Date de paiement requise'; end if;
  if p_amount > 0 and coalesce(p_method, '') not in ('virement', 'cheque', 'especes', 'versement', 'autre') then
    raise exception 'Mode de paiement invalide';
  end if;
  select * into r from public.qual_requests where id = p_id for update;
  if not found then raise exception 'Dossier introuvable'; end if;
  if r.decision <> 'go' then raise exception 'La décision Go est requise avant d''engager la R&D'; end if;
  if r.rd_fee_paid_on is not null then raise exception 'Les frais d''étude sont déjà enregistrés'; end if;
  perform private.qual_ensure_crm(p_id);
  select * into r from public.qual_requests where id = p_id;
  select * into st from public.qual_settings where id = 1;
  update public.deals set stage = 'rd_en_cours' where id = r.deal_id and stage in ('nouveau', 'fiche_envoyee', 'brief', 'cadrage');
  if p_amount > 0 then
    insert into public.payments (client_id, deal_id, amount, paid_at, method, reference, notes, created_by)
    values (r.client_id, r.deal_id, p_amount, p_paid_on, p_method, 'Étude R&D ' || r.reference,
            'Frais d''étude R&D, déductibles de la première production commandée avant le ' ||
            to_char(p_paid_on + make_interval(months => st.rd_credit_months), 'DD/MM/YYYY'), auth.uid())
    returning id into pid;
  end if;
  update public.qual_requests
     set rd_fee_dzd = p_amount, rd_fee_paid_on = p_paid_on, rd_payment_id = pid, nda_signed_on = coalesce(p_nda_on, nda_signed_on),
         rd_credit_until = (p_paid_on + make_interval(months => st.rd_credit_months))::date
   where id = p_id;
  perform private.qual_log(p_id, 'rd_paid', jsonb_build_object('amount', p_amount, 'paid_on', p_paid_on));
end $$;

create or replace function public.qual_formula(p_id uuid, p_delivered boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests;
begin
  perform private.qual_need_member();
  select * into r from public.qual_requests where id = p_id for update;
  if not found then raise exception 'Dossier introuvable'; end if;
  if r.decision <> 'go' then raise exception 'La décision Go est requise'; end if;
  if p_delivered then
    update public.qual_requests set formula_delivered_at = coalesce(formula_delivered_at, now()), samples_round = greatest(samples_round, 1) where id = p_id;
    update public.deals set stage = 'formule_livree' where id = r.deal_id and stage in ('cadrage', 'rd_en_cours');
    perform private.qual_log(p_id, 'formula_delivered', jsonb_build_object('note', p_note));
  else
    update public.qual_requests set samples_round = samples_round + 1 where id = p_id returning * into r;
    perform private.qual_log(p_id, 'sample_round', jsonb_build_object('round', r.samples_round, 'note', p_note));
  end if;
end $$;

create or replace function public.qual_final_quote(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.qual_requests;
begin
  perform private.qual_need_member();
  select * into r from public.qual_requests where id = p_id for update;
  if not found then raise exception 'Dossier introuvable'; end if;
  if r.decision <> 'go' then raise exception 'La décision Go est requise'; end if;
  update public.qual_requests set final_quote_sent_at = now() where id = p_id;
  update public.deals set stage = 'devis_envoye' where id = r.deal_id and stage in ('brief', 'cadrage', 'rd_en_cours', 'formule_livree');
  perform private.qual_log(p_id, 'final_quote_sent', '{}'::jsonb);
end $$;

create or replace function public.qual_archive(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.qual_need_member();
  update public.qual_requests set archived = p_archived where id = p_id;
  if not found then raise exception 'Dossier introuvable'; end if;
  perform private.qual_log(p_id, case when p_archived then 'archived' else 'unarchived' end, '{}'::jsonb);
end $$;
