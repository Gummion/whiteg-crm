-- =====================================================================
-- White G — Statistiques de visite du site dzwhiteg.com (base whiteg-crm)
-- • Aucune adresse IP n'est stockée. Le pays / la ville viennent de Vercel (approximatifs).
-- • Le visiteur est identifié par un numéro aléatoire stocké dans son navigateur (pas de nom, pas d'email).
-- • Écriture uniquement par le serveur du site (fonction site_track, clé secrète).
-- • Lecture uniquement par l'équipe du CRM (fonction site_stats).
-- • Les données de plus de 13 mois sont supprimées automatiquement.
-- =====================================================================

create table if not exists public.site_sessions (
  id uuid primary key,
  visitor_id uuid not null,
  is_new_visitor boolean not null default true,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  landing_path text,
  referrer_host text,
  referrer_path text,
  channel text not null default 'direct',
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  click_id text,
  in_app text,
  device text, os text, os_version text, browser text, browser_version text,
  screen_w integer, screen_h integer, lang text, tz text,
  country text, region text, city text,
  pageviews integer not null default 0,
  events integer not null default 0,
  engaged_seconds integer not null default 0,
  max_scroll integer not null default 0
);
create index if not exists site_sessions_started_idx on public.site_sessions (started_at desc);
create index if not exists site_sessions_visitor_idx on public.site_sessions (visitor_id, started_at);

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.site_sessions(id) on delete cascade,
  visitor_id uuid not null,
  at timestamptz not null default now(),
  type text not null,
  path text,
  label text,
  value numeric,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists site_events_at_idx on public.site_events (at desc);
create index if not exists site_events_session_idx on public.site_events (session_id, at);
create index if not exists site_events_type_idx on public.site_events (type, at desc);

alter table public.site_sessions enable row level security;
alter table public.site_events enable row level security;
drop policy if exists "crm members read" on public.site_sessions;
create policy "crm members read" on public.site_sessions for select using ((select private.is_crm_member()));
drop policy if exists "crm members read" on public.site_events;
create policy "crm members read" on public.site_events for select using ((select private.is_crm_member()));
revoke all on public.site_sessions, public.site_events from anon;

-- ---------- Écriture (appelée par le serveur du site) ----------
create or replace function public.site_track(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid uuid; vid uuid; s jsonb := coalesce(p->'session', '{}'::jsonb); e jsonb;
  n_pv integer := 0; n_ev integer := 0; eng integer := 0; scr integer := 0; ok integer := 0;
  t text; allowed text[] := array['pageview','click','engage','devis_step','devis_submit','fiche_open','fiche_step','fiche_submit','contact_submit','inapp_redirect','outbound'];
begin
  begin
    sid := (p->>'sid')::uuid; vid := (p->>'vid')::uuid;
  exception when others then return jsonb_build_object('error', 'bad_ids');
  end;
  if sid is null or vid is null then return jsonb_build_object('error', 'bad_ids'); end if;

  insert into public.site_sessions (id, visitor_id, is_new_visitor, landing_path, referrer_host, referrer_path, channel,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, click_id, in_app, device, os, os_version, browser, browser_version,
    screen_w, screen_h, lang, tz, country, region, city)
  values (sid, vid,
    not exists (select 1 from public.site_sessions x where x.visitor_id = vid),
    left(s->>'landing_path', 300), left(s->>'referrer_host', 200), left(s->>'referrer_path', 300), coalesce(left(s->>'channel', 40), 'direct'),
    left(s->>'utm_source', 120), left(s->>'utm_medium', 120), left(s->>'utm_campaign', 160), left(s->>'utm_content', 160), left(s->>'utm_term', 160),
    left(s->>'click_id', 20), left(s->>'in_app', 40), left(s->>'device', 20), left(s->>'os', 40), left(s->>'os_version', 20),
    left(s->>'browser', 40), left(s->>'browser_version', 20),
    nullif(s->>'screen_w', '')::integer, nullif(s->>'screen_h', '')::integer, left(s->>'lang', 20), left(s->>'tz', 60),
    left(s->>'country', 4), left(s->>'region', 80), left(s->>'city', 120))
  on conflict (id) do nothing;

  -- une session appartient toujours au même visiteur
  if not exists (select 1 from public.site_sessions x where x.id = sid and x.visitor_id = vid) then
    return jsonb_build_object('error', 'mismatch');
  end if;

  for e in select * from jsonb_array_elements(coalesce(p->'events', '[]'::jsonb)) limit 50 loop
    t := e->>'type';
    continue when t is null or not (t = any(allowed));
    if t = 'engage' then
      eng := eng + least(greatest(coalesce((e->>'value')::integer, 0), 0), 1800);
      scr := greatest(scr, least(greatest(coalesce((e->'meta'->>'scroll')::integer, 0), 0), 100));
      continue;
    end if;
    insert into public.site_events (session_id, visitor_id, type, path, label, value, meta)
    values (sid, vid, t, left(e->>'path', 300), left(e->>'label', 160),
            case when (e->>'value') ~ '^-?\d+(\.\d+)?$' then (e->>'value')::numeric end,
            case when jsonb_typeof(e->'meta') = 'object' and length((e->'meta')::text) < 2000 then e->'meta' else '{}'::jsonb end);
    ok := ok + 1;
    if t = 'pageview' then n_pv := n_pv + 1; else n_ev := n_ev + 1; end if;
  end loop;

  update public.site_sessions set
    last_seen_at = now(), pageviews = pageviews + n_pv, events = events + n_ev,
    engaged_seconds = least(engaged_seconds + eng, 6 * 3600), max_scroll = greatest(max_scroll, scr)
  where id = sid;
  return jsonb_build_object('ok', true, 'stored', ok);
end $$;
revoke all on function public.site_track(jsonb) from public, anon, authenticated;
grant execute on function public.site_track(jsonb) to service_role;

-- ---------- Lecture (écran Statistiques du CRM) ----------
create or replace function public.site_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Africa/Algiers');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Africa/Algiers');
  dur integer := (p_to - p_from) + 1;
  pt0 timestamptz := ((p_from - dur)::timestamp at time zone 'Africa/Algiers');
  r jsonb;
begin
  if not private.is_crm_member() then raise exception 'Accès réservé à l''équipe White G' using errcode = '42501'; end if;
  if p_to < p_from or dur > 400 then raise exception 'Période invalide'; end if;

  with s as (select * from public.site_sessions where started_at >= t0 and started_at < t1),
       ps as (select * from public.site_sessions where started_at >= pt0 and started_at < t0),
       ev as (select e.*, x.channel from public.site_events e join public.site_sessions x on x.id = e.session_id where e.at >= t0 and e.at < t1),
       conv as (select session_id, label from ev where type = 'devis_submit'),
       kpi as (
         select count(distinct visitor_id) visitors, count(*) sessions, coalesce(sum(pageviews), 0) pageviews,
                count(*) filter (where is_new_visitor) new_visitors,
                round(avg(engaged_seconds))::integer avg_engaged,
                round(100.0 * count(*) filter (where pageviews <= 1 and engaged_seconds < 10) / nullif(count(*), 0))::integer bounce_rate,
                (select count(distinct session_id) from conv) conversions
         from s),
       pkpi as (select count(distinct visitor_id) visitors, count(*) sessions, coalesce(sum(pageviews), 0) pageviews,
                       (select count(distinct e.session_id) from public.site_events e join ps on ps.id = e.session_id where e.type = 'devis_submit') conversions
                from ps)
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', dur),
    'kpi', (select to_jsonb(kpi) from kpi),
    'previous', (select to_jsonb(pkpi) from pkpi),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'visitors', coalesce(v.visitors, 0), 'sessions', coalesce(v.sessions, 0), 'pageviews', coalesce(v.pageviews, 0)) order by d), '[]')
              from generate_series(p_from, p_to, interval '1 day') d
              left join (select (started_at at time zone 'Africa/Algiers')::date dd, count(distinct visitor_id) visitors, count(*) sessions, sum(pageviews) pageviews from s group by 1) v on v.dd = d::date),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'sessions', coalesce(c, 0)) order by h), '[]')
              from generate_series(0, 23) h left join (select extract(hour from started_at at time zone 'Africa/Algiers')::integer hh, count(*) c from s group by 1) q on q.hh = h),
    'channels', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select channel as key, count(*) sessions, count(distinct visitor_id) visitors, round(avg(engaged_seconds))::integer avg_engaged,
                         count(*) filter (where id in (select session_id from conv)) conversions
                  from s group by channel) x),
    'campaigns', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select coalesce(utm_source, '—') src, coalesce(utm_medium, '—') medium, utm_campaign campaign, count(*) sessions,
                         count(*) filter (where id in (select session_id from conv)) conversions
                  from s where utm_campaign is not null or utm_source is not null group by 1, 2, 3 limit 30) x),
    'referrers', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select referrer_host as key, count(*) sessions from s where referrer_host is not null group by 1 order by 2 desc limit 15) x),
    'in_app', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select coalesce(in_app, 'navigateur') as key, count(*) sessions from s group by 1) x),
    'inapp_redirects', (select count(*) from ev where type = 'inapp_redirect'),
    'countries', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select coalesce(country, '??') as key, count(*) sessions, count(distinct visitor_id) visitors from s group by 1 order by 2 desc limit 20) x),
    'cities', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select coalesce(city, 'Inconnue') as key, max(country) country, count(*) sessions from s group by 1 order by 3 desc limit 20) x),
    'devices', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (select coalesce(device, 'inconnu') as key, count(*) sessions from s group by 1) x),
    'os', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (select coalesce(os, 'inconnu') as key, count(*) sessions from s group by 1 order by 2 desc limit 10) x),
    'browsers', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (select coalesce(browser, 'inconnu') as key, count(*) sessions from s group by 1 order by 2 desc limit 10) x),
    'langs', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (select coalesce(split_part(lang, '-', 1), '?') as key, count(*) sessions from s group by 1 order by 2 desc limit 8) x),
    'pages', (select coalesce(jsonb_agg(x order by x.views desc), '[]') from (
                  select path as key, count(*) views, count(distinct session_id) sessions from ev where type = 'pageview' group by 1 order by 2 desc limit 25) x),
    'landings', (select coalesce(jsonb_agg(x order by x.sessions desc), '[]') from (
                  select landing_path as key, count(*) sessions, round(100.0 * count(*) filter (where pageviews <= 1 and engaged_seconds < 10) / nullif(count(*), 0))::integer bounce
                  from s group by 1 order by 2 desc limit 15) x),
    'clicks', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (
                  select label as key, count(*) n, count(distinct session_id) sessions from ev where type = 'click' group by 1 order by 2 desc limit 20) x),
    'funnel', jsonb_build_array(
                  jsonb_build_object('step', 'Visites', 'n', (select count(*) from s)),
                  jsonb_build_object('step', 'Page Devis ouverte', 'n', (select count(distinct session_id) from ev where type = 'pageview' and path like '/devis%')),
                  jsonb_build_object('step', 'Étape 2 du devis', 'n', (select count(distinct session_id) from ev where type = 'devis_step' and value >= 2)),
                  jsonb_build_object('step', 'Étape 3 du devis', 'n', (select count(distinct session_id) from ev where type = 'devis_step' and value >= 3)),
                  jsonb_build_object('step', 'Demande envoyée', 'n', (select count(distinct session_id) from conv)),
                  jsonb_build_object('step', 'Fiche ouverte', 'n', (select count(*) from public.qual_requests q where q.created_at >= t0 and q.created_at < t1 and q.fiche_opened_at is not null)),
                  jsonb_build_object('step', 'Fiche envoyée', 'n', (select count(*) from public.qual_requests q where q.created_at >= t0 and q.created_at < t1 and q.fiche_submitted_at is not null))),
    'requests_by_channel', (select coalesce(jsonb_agg(x order by x.n desc), '[]') from (
                  select coalesce(c.channel, 'non suivi') as key, count(*) n,
                         count(*) filter (where q.grade = 'A') a, count(*) filter (where q.grade = 'B') b,
                         count(*) filter (where q.grade = 'C') c, count(*) filter (where q.grade = 'D') d
                  from public.qual_requests q
                  left join lateral (select ev2.channel from ev ev2 where ev2.type = 'devis_submit' and ev2.label = q.reference limit 1) c on true
                  where q.created_at >= t0 and q.created_at < t1 group by 1) x),
    'recent', (select coalesce(jsonb_agg(x order by x.started_at desc), '[]') from (
                  select id, started_at, channel, in_app, utm_campaign, landing_path, device, os, browser, country, city, pageviews, engaged_seconds, is_new_visitor,
                         exists (select 1 from conv where conv.session_id = s.id) converted
                  from s order by started_at desc limit 40) x)
  ) into r;
  return r;
end $$;
revoke all on function public.site_stats(date, date) from public, anon;
grant execute on function public.site_stats(date, date) to authenticated;

-- ---------- Purge automatique (13 mois) ----------
create or replace function public.site_purge_analytics()
returns integer language sql security definer set search_path = '' as $$
  with d as (delete from public.site_sessions where started_at < now() - interval '13 months' returning 1) select count(*)::integer from d;
$$;
revoke all on function public.site_purge_analytics() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'site-analytics-purge';
select cron.schedule('site-analytics-purge', '30 3 1 * *', $$select public.site_purge_analytics()$$);

select 'Statistiques de visite installées' as resultat;
