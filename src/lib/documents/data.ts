"use client";

import { supabaseBrowser } from "../supabase/client";
import type { Company, Doc, DocKind } from "./config";
import { DOC_KINDS, computeTotals } from "./config";
import { defaultData, defaultTitle } from "./templates";
import type { PdfInput, StatementRow } from "./pdf";

export async function loadCompany(): Promise<Company> {
  const { data } = await supabaseBrowser().from("company_settings").select("*").eq("id", 1).single();
  return data as Company;
}

/** Create a document for a client (optionally a deal) with the kind's template, or converted from a source document. */
export async function createDocument(kind: DocKind, opts: { clientId: string; dealId?: string | null; source?: Doc | null }) {
  const sb = supabaseBrowser();
  const [company, client, contact, deal] = await Promise.all([
    loadCompany(),
    sb.from("clients").select("*").eq("id", opts.clientId).single().then((r) => r.data),
    sb.from("contacts").select("*").eq("client_id", opts.clientId).order("is_primary", { ascending: false }).limit(1).maybeSingle().then((r) => r.data),
    opts.dealId ? sb.from("deals").select("*").eq("id", opts.dealId).single().then((r) => r.data) : Promise.resolve(null),
  ]);
  const data = defaultData(kind, { company, client, contact, deal });
  if (opts.source) {
    const src = opts.source.data ?? {};
    if (DOC_KINDS[kind].priced && src.lines?.length) {
      data.lines = src.lines.map((l) => ({ ...l }));
      data.tva_rate = src.tva_rate ?? data.tva_rate;
      data.discount_global = src.discount_global;
    }
    if (src.object) data.object = src.object.replace(/^(Devis|Proposition d'accompagnement|Commande|Facture proforma|Cahier des charges)\s+—\s+/i, `${DOC_KINDS[kind].short} — `);
  }
  const t = computeTotals(data);
  const due = kind === "facture" ? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) : null;
  const { data: row, error } = await sb.from("documents").insert({
    kind, client_id: opts.clientId, deal_id: opts.dealId ?? opts.source?.deal_id ?? null, source_id: opts.source?.id ?? null,
    title: defaultTitle(kind, { company, client, contact, deal }), data, due_date: due,
    total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

/** Everything the PDF needs for one document. */
export async function loadPdfInput(doc: Doc, company?: Company): Promise<PdfInput> {
  const sb = supabaseBrowser();
  const [co, client, contact, deal] = await Promise.all([
    company ? Promise.resolve(company) : loadCompany(),
    sb.from("clients").select("*").eq("id", doc.client_id).single().then((r) => r.data),
    sb.from("contacts").select("*").eq("client_id", doc.client_id).order("is_primary", { ascending: false }).limit(1).maybeSingle().then((r) => r.data),
    doc.deal_id ? sb.from("deals").select("title").eq("id", doc.deal_id).single().then((r) => r.data) : Promise.resolve(null),
  ]);
  let statement: StatementRow[] | undefined;
  if (doc.kind === "etat_compte") statement = await loadStatement(doc.client_id, doc.data.period?.from, doc.data.period?.to);
  return { doc, company: co, client, contact, dealTitle: deal?.title ?? null, statement };
}

export async function loadStatement(clientId: string, from?: string, to?: string): Promise<StatementRow[]> {
  const sb = supabaseBrowser();
  let inv = sb.from("documents").select("number,issue_date,total_ttc,data,status").eq("client_id", clientId).eq("kind", "facture").not("status", "in", "(brouillon,annule)");
  let pay = sb.from("payments").select("paid_at,amount,method,reference,documents(number)").eq("client_id", clientId);
  if (from) { inv = inv.gte("issue_date", from); pay = pay.gte("paid_at", from); }
  if (to) { inv = inv.lte("issue_date", to); pay = pay.lte("paid_at", to); }
  const [a, b] = await Promise.all([inv, pay]);
  const methods: Record<string, string> = { virement: "Virement", cheque: "Chèque", especes: "Espèces", versement: "Versement", autre: "Règlement" };
  return [
    ...(a.data ?? []).map((f: { number: string; issue_date: string; total_ttc: number; data: { object?: string } }) => ({
      date: f.issue_date, ref: f.number, label: f.data?.object ?? "Facture", debit: Number(f.total_ttc), credit: 0,
    })),
    ...(b.data ?? []).map((p: { paid_at: string; amount: number; method: string; reference: string | null; documents: { number: string } | { number: string }[] | null }) => {
      const num = Array.isArray(p.documents) ? p.documents[0]?.number : p.documents?.number;
      return { date: p.paid_at, ref: p.reference || methods[p.method] || "Règlement", label: `Règlement${num ? " " + num : ""} — ${methods[p.method] ?? p.method}`, debit: 0, credit: Number(p.amount) };
    }),
  ];
}

/** Render to a PDF Blob in the browser (react-pdf is loaded lazily, only when needed). */
export async function renderPdfBlob(input: PdfInput): Promise<Blob> {
  const [{ pdf }, mod, React] = await Promise.all([import("@react-pdf/renderer"), import("./pdf"), import("react")]);
  mod.registerPdfFonts(window.location.origin);
  return pdf(React.createElement(mod.DocumentPdf, input) as Parameters<typeof pdf>[0]).toBlob();
}

export function pdfFileName(doc: Doc, clientName: string) {
  const safe = clientName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${doc.number}_${safe}.pdf`;
}

export async function downloadPdf(doc: Doc, company?: Company) {
  const input = await loadPdfInput(doc, company);
  const blob = await renderPdfBlob(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = pdfFileName(doc, input.client.company_name);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
