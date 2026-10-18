-- Sécurité des tables du site (préfixe site_)
-- • Visiteurs du site : lecture du catalogue et du contenu des pages, envoi d'un message de contact. Rien d'autre.
-- • Espace admin du site : passe par la clé secrète côté serveur (non soumise à ces règles).
-- • Équipe du CRM : accès complet, pour pouvoir afficher ces données dans le CRM.

do $$
declare t text;
begin
  foreach t in array array['site_clients','site_contact_messages','site_digital_products','site_dynamic_services','site_kpi_entries',
                           'site_leads','site_missions','site_offer_categories','site_offers','site_service_categories','site_site_content','site_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "crm members full access" on public.%I', t);
    execute format('create policy "crm members full access" on public.%I for all using ((select private.is_crm_member())) with check ((select private.is_crm_member()))', t);
  end loop;

  foreach t in array array['site_dynamic_services','site_service_categories','site_offer_categories','site_offers','site_site_content']
  loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists "public can send a message" on public.site_contact_messages;
create policy "public can send a message" on public.site_contact_messages for insert to anon, authenticated
  with check (
    length(name) between 1 and 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200
    and length(message) between 1 and 5000 and coalesce(length(subject), 0) <= 300
    and coalesce(status, 'NEW') = 'NEW'
  );

-- Stockage public des photos des offres
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-offer-images', 'site-offer-images', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update set public = true;
-- Bucket public : les images sont lisibles par leur adresse. Les envois passent par la clé secrète (espace admin du site).
