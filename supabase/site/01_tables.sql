-- Tables du site dzwhiteg.com, copiées depuis le projet Supabase ncolrjuftmjygnwvvpna (préfixe site_)

-- Elles sont séparées des tables du CRM (aucune clé étrangère vers les tables CRM).

create table if not exists public.site_clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company_name text not null,
  email text,
  phone text,
  missions_count integer default 0 not null,
  active_subscriptions_count integer default 0 not null,
  last_contact_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.site_contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  status text default 'NEW'::text,
  created_at timestamptz default now()
);

create table if not exists public.site_digital_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content_type text default 'PDF'::text not null,
  status text default 'DRAFT'::text not null,
  file_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.site_dynamic_services (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category_slug text not null,
  slug text not null,
  description text,
  full_details jsonb,
  price_min numeric,
  price_max numeric,
  delay text,
  entity text,
  is_popular boolean default false,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  cash_type text,
  subscription_eligible boolean default false,
  unique (code),
  unique (slug)
);

create table if not exists public.site_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  metric_value numeric default 0 not null,
  period_label text not null,
  created_at timestamptz default now() not null
);

create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  status text default 'NEW'::text not null,
  first_name text not null,
  last_name text not null,
  company_name text not null,
  role_title text not null,
  email text not null,
  phone text,
  category_slug text,
  service_codes text[] default '{}'::text[] not null,
  sector text not null,
  company_size text not null,
  budget_range text not null,
  deadline_need text not null,
  message text not null,
  source text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (reference)
);

create table if not exists public.site_missions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  status text default 'PENDING'::text not null,
  client_id uuid,
  client_name text,
  due_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (code)
);

create table if not exists public.site_offer_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  slug text not null,
  name text not null,
  color_hex text,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (code)
);

create table if not exists public.site_offers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  slug text not null,
  category_code text not null,
  category_slug text,
  name text not null,
  description text,
  delay_label text,
  entity text,
  cash_type text,
  is_popular boolean default false not null,
  is_subscription_eligible boolean default false not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  image_url text,
  carousel_position integer,
  unique (slug)
);

create table if not exists public.site_service_categories (
  slug text primary key,
  code text not null,
  name text not null,
  color_var text,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.site_site_content (
  id uuid primary key default gen_random_uuid(),
  page_slug text not null,
  section_key text not null,
  content jsonb not null,
  updated_at timestamptz default now(),
  unique (page_slug, section_key)
);

create table if not exists public.site_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  client_name text not null,
  service_code text not null,
  plan_label text not null,
  status text default 'ACTIVE'::text not null,
  next_billing_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
