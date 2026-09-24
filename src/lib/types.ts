import type { ClientStatus, DealStage, OfferCategory } from "./constants";

export type Client = {
  id: string;
  company_name: string;
  sector: string;
  status: ClientStatus;
  source: string;
  wilaya: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  rc_number: string | null;
  nif: string | null;
  tags: string[];
  notes: string | null;
  owner_id: string | null;
  external_source: string | null;
  external_id: string | null;
  last_contact_at: string | null;
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  client_id: string;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
};

export type Deal = {
  id: string;
  client_id: string;
  title: string;
  category: OfferCategory;
  product_format: string | null;
  stage: DealStage;
  amount: number;
  deposit_amount: number;
  deposit_paid: boolean;
  probability: number;
  quote_ref: string | null;
  expected_close: string | null;
  start_date: string | null;
  delivery_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  owner_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  stage_changed_at: string;
  clients?: { id: string; company_name: string } | null;
};

export type Activity = {
  id: string;
  client_id: string;
  deal_id: string | null;
  type: string;
  subject: string;
  body: string | null;
  occurred_at: string;
  author_id: string | null;
  created_at: string;
  clients?: { id: string; company_name: string } | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  deal_id: string | null;
  due_at: string | null;
  priority: string;
  done: boolean;
  done_at: string | null;
  assignee_id: string | null;
  created_at: string;
  clients?: { id: string; company_name: string } | null;
};

export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

export type Member = { user_id: string; email: string; full_name: string | null; role: "admin" | "member" };
