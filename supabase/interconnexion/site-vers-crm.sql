-- =====================================================================
-- À exécuter dans le SQL Editor de la base Supabase DU SITE dzwhiteg.com
-- (pas dans celle du CRM). Chaque nouvelle demande de devis est envoyée
-- automatiquement au CRM White G.
-- 1) Remplacez  public.devis  par le nom réel de votre table de demandes.
-- 2) Remplacez  VOTRE_SECRET  par le secret fourni (ne le publiez jamais).
-- =====================================================================
create extension if not exists pg_net;

create or replace function public.push_lead_to_crm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url     := 'https://fefklwmukpiwzxnluybb.supabase.co/functions/v1/ingest-lead',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'VOTRE_SECRET'),
    body    := jsonb_build_object('type', 'INSERT', 'table', tg_table_name, 'record', to_jsonb(new))
  );
  return new;
end $$;

drop trigger if exists push_lead_to_crm on public.devis;
create trigger push_lead_to_crm after insert on public.devis
for each row execute function public.push_lead_to_crm();

-- Alternative sans SQL : Dashboard du site > Database > Webhooks > Create
--   Table : devis · Événement : INSERT · Type : HTTP Request · POST
--   URL : https://fefklwmukpiwzxnluybb.supabase.co/functions/v1/ingest-lead
--   Header : x-webhook-secret = VOTRE_SECRET
