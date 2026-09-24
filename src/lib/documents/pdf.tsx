import { Document, Font, Page, Polygon, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Company, Doc, DocData, DocLine } from "./config";
import { DOC_KINDS, computeTotals, lineTotal } from "./config";
import { amountInWords } from "./words";
import { money } from "./money";

/* ------------------------------------------------------------------ */
/* Fonts                                                               */
/* ------------------------------------------------------------------ */
/**
 * Register fonts. Call before EVERY render: react-pdf keeps glyph subsets per font instance,
 * and re-using one instance across several documents can drop glyphs in later PDFs.
 * Each call registers a fresh family name, so every PDF embeds a complete, independent subset
 * (the font files themselves stay in the browser/HTTP cache, so this is cheap).
 */
let family = "Inter";
let counter = 0;
export function registerPdfFonts(base: string) {
  family = `Inter-${++counter}`;
  // `base` is either the app origin (fonts served from /public/fonts) or "cdn" (jsDelivr mirror of the same files)
  const src = (w: number) =>
    base === "cdn"
      ? `https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/files/inter-latin-${w}-normal.woff`
      : `${base}/fonts/Inter-${w}.woff`;
  Font.register({
    family,
    fonts: [400, 500, 600, 700].map((w) => ({ src: src(w), fontWeight: w })),
  });
  // never split words with hyphens (French text, references, amounts)
  Font.registerHyphenationCallback((word) => [word]);
  return family;
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */
const C = {
  ink: "#111111",
  body: "#2b2b2b",
  muted: "#6f6f6f",
  faint: "#9a9a9a",
  line: "#e7e5e2",
  soft: "#f6f5f3",
  brand: "#ED9C35",
  brandSoft: "#fdf3e6",
  brandInk: "#9a5a0c",
  green: "#1f8a5b",
  red: "#c0392b",
};

const s = StyleSheet.create({
  page: { fontSize: 9.5, color: C.body, paddingTop: 104, paddingBottom: 66, paddingHorizontal: 44, lineHeight: 1.45 },
  header: { position: "absolute", top: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerRule: { position: "absolute", top: 84, left: 44, right: 44, flexDirection: "row", height: 1.5 },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 7, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  footLegal: { fontSize: 6.8, color: C.faint, lineHeight: 1.5, maxWidth: 430 },
  pageNum: { position: "absolute", top: 808, left: 44, right: 44, textAlign: "right", fontSize: 7.5, color: C.muted },
  coName: { fontSize: 8.5, fontWeight: 700, color: C.ink, textAlign: "right" },
  coLine: { fontSize: 7.3, color: C.muted, textAlign: "right", lineHeight: 1.45 },

  kicker: { fontSize: 7.5, fontWeight: 600, color: C.brandInk, textTransform: "uppercase", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700, color: C.ink, lineHeight: 1.15 },
  number: { fontSize: 9.5, color: C.muted, marginTop: 4 },

  card: { backgroundColor: C.soft, borderRadius: 5, padding: 11 },
  cardLabel: { fontSize: 6.8, fontWeight: 600, color: C.faint, textTransform: "uppercase", marginBottom: 4 },
  cardTitle: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 2 },
  small: { fontSize: 8.3, color: C.muted, lineHeight: 1.45 },

  metaRow: { flexDirection: "row", borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.line, marginTop: 16, marginBottom: 14 },
  metaCell: { flex: 1, paddingVertical: 7, paddingRight: 8 },
  metaLabel: { fontSize: 6.8, color: C.faint, textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 9, fontWeight: 600, color: C.ink },

  object: { fontSize: 10.5, fontWeight: 600, color: C.ink, marginBottom: 10 },
  para: { marginBottom: 6 },

  th: { flexDirection: "row", backgroundColor: C.ink, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  thCell: { color: "#ffffff", fontSize: 7.2, fontWeight: 600, textTransform: "uppercase", paddingVertical: 6, paddingHorizontal: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  td: { paddingVertical: 7, paddingHorizontal: 6, fontSize: 9 },

  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totals: { width: 238 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 8 },
  totLabel: { color: C.muted, fontSize: 9 },
  totValue: { color: C.ink, fontSize: 9, fontWeight: 500 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.ink, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 8, marginTop: 4 },
  words: { marginTop: 12, borderLeftWidth: 2, borderLeftColor: C.brand, backgroundColor: C.brandSoft, paddingVertical: 7, paddingHorizontal: 10, fontSize: 8.6, color: C.body },

  h2: { fontSize: 11, fontWeight: 700, color: C.ink, marginTop: 14, marginBottom: 6 },
  h2Bar: { width: 14, height: 2, backgroundColor: C.brand, marginBottom: 5 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 2 },
  bullet: { width: 12, color: C.brand, fontWeight: 700 },

  grid2: { flexDirection: "row", gap: 10, marginTop: 14 },
  condCard: { flex: 1, borderWidth: 0.5, borderColor: C.line, borderRadius: 5, padding: 9 },

  signRow: { flexDirection: "row", gap: 14, marginTop: 18 },
  signBox: { flex: 1, borderWidth: 0.5, borderColor: C.line, borderRadius: 5, padding: 10, height: 86 },

  infoRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  infoLabel: { width: 130, paddingVertical: 6, paddingRight: 8, fontSize: 8.3, color: C.muted },
  infoValue: { flex: 1, paddingVertical: 6, fontSize: 9, color: C.ink, fontWeight: 500 },

  stamp: { position: "absolute", top: 300, left: 0, right: 0, textAlign: "center", fontSize: 88, fontWeight: 700, color: "#000000", opacity: 0.045, transform: "rotate(-28deg)" },
  badge: { alignSelf: "flex-start", fontSize: 7.5, fontWeight: 700, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, marginTop: 7 },
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const dateFr = (d?: string | null) => (d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—");
const plus = (d: string, days: number) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10); };

/** Tiny markdown: **bold**, "- " bullets, "1. " numbered, blank line = paragraph */
function Rich({ text, size }: { text?: string; size?: number }) {
  if (!text?.trim()) return null;
  const blocks = text.replace(/\r/g, "").split(/\n/);
  const out: React.ReactNode[] = [];
  blocks.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim()) { out.push(<View key={i} style={{ height: 4 }} />); return; }
    const b = line.match(/^\s*[-•]\s+(.*)$/);
    const n = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (b || n) {
      out.push(
        <View key={i} style={s.bulletRow} wrap={false}>
          <Text style={[s.bullet, n ? { width: 16, fontSize: 8.5 } : {}]}>{n ? n[1] + "." : "•"}</Text>
          <Text style={{ flex: 1, fontSize: size }}>{inline(n ? n[2] : b![1])}</Text>
        </View>
      );
    } else out.push(<Text key={i} style={[s.para, size ? { fontSize: size } : {}]}>{inline(line)}</Text>);
  });
  return <View>{out}</View>;
}
function inline(t: string) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <Text key={i} style={{ fontWeight: 600, color: C.ink }}>{p.slice(2, -2)}</Text> : p));
}

function Logo({ size = 15 }: { size?: number }) {
  // vector re-drawing of the WHITE G logo: crisp at any zoom, prints perfectly
  const g = size * 0.98;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
      <Text style={{ fontSize: size, lineHeight: 1, fontWeight: 500, letterSpacing: size * 0.24, color: C.ink, marginRight: size * 0.12 }}>WHITE</Text>
      <Svg width={g * 1.04} height={g} viewBox="0 0 150 144" style={{ marginBottom: size * 0.16 }}>
        <Rect x={0} y={0} width={150} height={36} fill={C.ink} />
        <Rect x={0} y={0} width={36} height={144} fill={C.ink} />
        <Rect x={0} y={112} width={100} height={32} fill={C.ink} />
        <Rect x={114} y={100} width={36} height={44} fill={C.ink} />
        <Polygon points="150,70 150,100 76,100" fill={C.ink} />
        <Polygon points="76,72 148,72 76,99" fill={C.brand} />
      </Svg>
    </View>
  );
}

function Header({ co }: { co: Company }) {
  return (
    <>
      <View style={s.header} fixed>
        <View>
          <Logo />
          {co.tagline ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 6 }}>{co.tagline}</Text> : null}
        </View>
        <View>
          <Text style={s.coName}>{co.legal_name}</Text>
          {[co.address, [co.city, co.wilaya].filter(Boolean).join(", ")].filter(Boolean).map((l, i) => <Text key={i} style={s.coLine}>{l}</Text>)}
          <Text style={s.coLine}>{[co.phone, co.email].filter(Boolean).join("  ·  ")}</Text>
          {co.website ? <Text style={s.coLine}>{co.website}</Text> : null}
        </View>
      </View>
      <View style={s.headerRule} fixed>
        <View style={{ width: 36, backgroundColor: C.brand }} />
        <View style={{ flex: 1, backgroundColor: C.line, height: 0.5, marginTop: 0.5 }} />
      </View>
    </>
  );
}

function PageNumber() {
  return <Text style={s.pageNum} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />;
}

function Footer({ co }: { co: Company }) {
  const legal = [co.legal_name, co.capital && `Capital ${co.capital}`, co.rc && `RC ${co.rc}`, co.nif && `NIF ${co.nif}`, co.nis && `NIS ${co.nis}`, co.ai && `AI ${co.ai}`].filter(Boolean).join("  ·  ");
  const bank = [co.bank_name, co.rib && `RIB ${co.rib}`].filter(Boolean).join("  ·  ");
  return (
    <View style={s.footer} fixed>
      <View>
        <Text style={s.footLegal}>{legal}</Text>
        {bank ? <Text style={s.footLegal}>{bank}</Text> : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */
type ClientInfo = {
  company_name: string; address?: string | null; city?: string | null; wilaya?: string | null;
  phone?: string | null; email?: string | null; rc_number?: string | null; nif?: string | null;
};
type ContactInfo = { full_name: string; job_title?: string | null; phone?: string | null; email?: string | null } | null;

function TitleBlock({ doc, client, contact, heading }: { doc: Doc; client: ClientInfo; contact?: ContactInfo; heading: string }) {
  const badge =
    doc.status === "paye" ? { t: "PAYÉE", bg: "#e6f4ec", c: C.green }
    : doc.status === "accepte" ? { t: doc.kind === "contrat" || doc.kind === "nda" ? "SIGNÉ" : "ACCEPTÉ", bg: "#e6f4ec", c: C.green }
    : doc.status === "partiel" ? { t: "PAIEMENT PARTIEL", bg: C.brandSoft, c: C.brandInk }
    : doc.status === "annule" ? { t: "ANNULÉ", bg: "#fbeaea", c: C.red }
    : null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 20 }}>
      <View style={{ flex: 1 }}>
        <Text style={s.kicker}>{DOC_KINDS[doc.kind].phase === "projet" ? "Document de projet" : DOC_KINDS[doc.kind].phase === "cloture" ? "Document financier" : "Document commercial"}</Text>
        <Text style={s.title}>{heading}</Text>
        <Text style={s.number}>N° {doc.number}</Text>
        {badge ? <Text style={[s.badge, { backgroundColor: badge.bg, color: badge.c }]}>{badge.t}</Text> : null}
      </View>
      <View style={[s.card, { width: 220 }]}>
        <Text style={s.cardLabel}>{doc.kind === "contrat" || doc.kind === "nda" ? "Cocontractant" : "Client"}</Text>
        <Text style={s.cardTitle}>{client.company_name}</Text>
        {contact ? <Text style={s.small}>{contact.full_name}{contact.job_title ? ` — ${contact.job_title}` : ""}</Text> : null}
        {client.address ? <Text style={s.small}>{client.address}</Text> : null}
        {client.city || client.wilaya ? <Text style={s.small}>{[client.city, client.wilaya?.replace(/^\d+ /, "")].filter(Boolean).join(", ")}</Text> : null}
        {client.phone || contact?.phone ? <Text style={s.small}>{client.phone || contact?.phone}</Text> : null}
        {client.email || contact?.email ? <Text style={s.small}>{client.email || contact?.email}</Text> : null}
        {client.rc_number || client.nif ? <Text style={[s.small, { marginTop: 3, fontSize: 7.5 }]}>{[client.rc_number && `RC ${client.rc_number}`, client.nif && `NIF ${client.nif}`].filter(Boolean).join("  ·  ")}</Text> : null}
      </View>
    </View>
  );
}

function MetaRow({ items }: { items: { label: string; value?: string | null }[] }) {
  const list = items.filter((i) => i.value);
  if (!list.length) return null;
  return (
    <View style={s.metaRow}>
      {list.map((i, k) => (
        <View key={k} style={[s.metaCell, k > 0 ? { paddingLeft: 10, borderLeftWidth: 0.5, borderLeftColor: C.line } : {}]}>
          <Text style={s.metaLabel}>{i.label}</Text>
          <Text style={s.metaValue}>{i.value}</Text>
        </View>
      ))}
    </View>
  );
}

function LinesTable({ lines, heading }: { lines: DocLine[]; heading?: string }) {
  const hasDiscount = lines.some((l) => Number(l.discount) > 0);
  const W = { n: 22, qty: 38, unit: 50, pu: 72, disc: 40, tot: 80 };
  return (
    <View style={{ marginTop: 4 }}>
      <View wrap={false}>
        {heading ? (<><View style={[s.h2Bar, { marginTop: 16 }]} /><Text style={[s.h2, { marginTop: 0 }]}>{heading}</Text></>) : null}
        <View style={s.th}>
          <Text style={[s.thCell, { width: W.n }]}>#</Text>
          <Text style={[s.thCell, { flex: 1 }]}>Désignation</Text>
          <Text style={[s.thCell, { width: W.qty, textAlign: "right" }]}>Qté</Text>
          <Text style={[s.thCell, { width: W.unit }]}>Unité</Text>
          <Text style={[s.thCell, { width: W.pu, textAlign: "right" }]}>P.U. HT</Text>
          {hasDiscount ? <Text style={[s.thCell, { width: W.disc, textAlign: "right" }]}>Rem.</Text> : null}
          <Text style={[s.thCell, { width: W.tot, textAlign: "right" }]}>Total HT</Text>
        </View>
        {lines.slice(0, 1).map((l, i) => <LineRow key={i} l={l} i={i} W={W} hasDiscount={hasDiscount} />)}
      </View>
      {lines.slice(1).map((l, i) => <LineRow key={i + 1} l={l} i={i + 1} W={W} hasDiscount={hasDiscount} />)}
    </View>
  );
}

type Widths = { n: number; qty: number; unit: number; pu: number; disc: number; tot: number };
function LineRow({ l, i, W, hasDiscount }: { l: DocLine; i: number; W: Widths; hasDiscount: boolean }) {
  return (
        <View style={[s.tr, i % 2 ? { backgroundColor: "#fbfbfa" } : {}]} wrap={false}>
          <Text style={[s.td, { width: W.n, color: C.faint }]}>{String(i + 1).padStart(2, "0")}</Text>
          <View style={[s.td, { flex: 1 }]}>
            <Text style={{ fontWeight: 600, color: C.ink }}>{l.label || "—"}</Text>
            {l.description ? <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{l.description}</Text> : null}
          </View>
          <Text style={[s.td, { width: W.qty, textAlign: "right" }]}>{new Intl.NumberFormat("fr-FR").format(Number(l.qty) || 0)}</Text>
          <Text style={[s.td, { width: W.unit, color: C.muted }]}>{l.unit || ""}</Text>
          <Text style={[s.td, { width: W.pu, textAlign: "right" }]}>{money(l.price)}</Text>
          {hasDiscount ? <Text style={[s.td, { width: W.disc, textAlign: "right", color: C.muted }]}>{Number(l.discount) ? `${l.discount} %` : ""}</Text> : null}
          <Text style={[s.td, { width: W.tot, textAlign: "right", fontWeight: 600, color: C.ink }]}>{money(lineTotal(l))}</Text>
        </View>
  );
}

function Totals({ d, doc, wordsPrefix }: { d: DocData; doc: Doc; wordsPrefix: string }) {
  const t = computeTotals(d);
  const due = Math.max(0, t.ttc - Number(doc.amount_paid || 0));
  return (
    <View wrap={false}>
      <View style={s.totalsWrap}>
        <View style={s.totals}>
          {t.discount > 0 ? (
            <>
              <Row l="Sous-total HT" v={money(t.gross)} />
              <Row l={`Remise globale ${d.discount_global} %`} v={"− " + money(t.discount)} />
            </>
          ) : null}
          <Row l="Total HT" v={money(t.ht)} strong />
          <Row l={`TVA ${d.tva_rate ?? 19} %`} v={money(t.tva)} />
          {t.timbre > 0 ? <Row l="Droit de timbre" v={money(t.timbre)} /> : null}
          <View style={s.grand}>
            <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: 600 }}>TOTAL TTC</Text>
            <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: 700 }}>{money(t.ttc)} <Text style={{ fontSize: 8, color: C.brand }}>DA</Text></Text>
          </View>
          {doc.kind === "facture" && Number(doc.amount_paid) > 0 ? (
            <>
              <Row l="Déjà réglé" v={"− " + money(doc.amount_paid)} />
              <Row l="Reste à payer" v={money(due) + " DA"} strong />
            </>
          ) : null}
        </View>
      </View>
      <Text style={s.words}>
        {wordsPrefix} <Text style={{ fontWeight: 600, color: C.ink }}>{amountInWords(t.ttc)}</Text> toutes taxes comprises.
      </Text>
    </View>
  );
}
function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return (
    <View style={[s.totRow, strong ? { borderTopWidth: 0.5, borderTopColor: C.line } : {}]}>
      <Text style={[s.totLabel, strong ? { color: C.ink, fontWeight: 600 } : {}]}>{l}</Text>
      <Text style={[s.totValue, strong ? { fontWeight: 700 } : {}]}>{v}</Text>
    </View>
  );
}

function Conditions({ items }: { items: { title: string; body?: string | null }[] }) {
  const list = items.filter((i) => i.body);
  if (!list.length) return null;
  const rows: typeof list[] = [];
  for (let i = 0; i < list.length; i += 3) rows.push(list.slice(i, i + 3));
  return (
    <View style={{ marginTop: 8 }}>
      {rows.map((r, k) => (
        <View key={k} style={[s.grid2, { marginTop: 8 }]} wrap={false}>
          {r.map((c, j) => (
            <View key={j} style={s.condCard}>
              <Text style={s.cardLabel}>{c.title}</Text>
              <Text style={{ fontSize: 8.6, color: C.body }}>{c.body}</Text>
            </View>
          ))}
          {r.length < 3 && rows.length > 1 ? Array.from({ length: 3 - r.length }).map((_, j) => <View key={"f" + j} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

function Signatures({ left, right, co }: { left: string; right: string; co: Company }) {
  return (
    <View style={s.signRow} wrap={false}>
      <View style={s.signBox}>
        <Text style={s.cardLabel}>{left}</Text>
        <Text style={{ fontSize: 8.5, fontWeight: 600, color: C.ink }}>{co.signatory_name ?? co.trade_name}</Text>
        {co.signatory_title ? <Text style={s.small}>{co.signatory_title}</Text> : null}
        <Text style={[s.small, { marginTop: "auto", fontSize: 7.5, color: C.faint }]}>Date, cachet et signature</Text>
      </View>
      <View style={s.signBox}>
        <Text style={s.cardLabel}>{right}</Text>
        <Text style={s.small}>Nom, qualité :</Text>
        <Text style={[s.small, { marginTop: "auto", fontSize: 7.5, color: C.faint }]}>Date, cachet et signature précédés de « Lu et approuvé »</Text>
      </View>
    </View>
  );
}

/** split a body so the heading always stays with its first lines (no orphan titles at page bottom) */
function splitHead(body?: string): [string, string] {
  const t = (body ?? "").replace(/\r/g, "");
  if (t.length < 700) return [t, ""];
  const lines = t.split("\n");
  const head: string[] = [];
  while (lines.length && head.join("\n").length < 220) head.push(lines.shift()!);
  return [head.join("\n"), lines.join("\n")];
}

function Sections({ sections }: { sections?: { title: string; body: string }[] }) {
  if (!sections?.length) return null;
  return (
    <View>
      {sections.filter((x) => x.title || x.body).map((sec, i) => (
        <View key={i}>
          <View wrap={false}>
            <View style={[s.h2Bar, { marginTop: 14 }]} />
            <Text style={[s.h2, { marginTop: 0 }]}>{sec.title}</Text>
            {sec.body?.trim() ? <Rich text={splitHead(sec.body)[0]} /> : <Text style={{ color: C.faint }}>—</Text>}
          </View>
          <Rich text={splitHead(sec.body)[1]} />
        </View>
      ))}
    </View>
  );
}

function Articles({ articles }: { articles?: { title: string; body: string }[] }) {
  if (!articles?.length) return null;
  return (
    <View style={{ marginTop: 6 }}>
      {articles.map((a, i) => (
        <View key={i} style={{ marginTop: 10 }}>
          <View wrap={false}>
            <Text style={{ fontSize: 9.8, fontWeight: 700, color: C.ink, marginBottom: 3 }}>
              <Text style={{ color: C.brandInk }}>Article {i + 1}</Text>  —  {a.title}
            </Text>
            <Rich text={splitHead(a.body)[0]} />
          </View>
          <Rich text={splitHead(a.body)[1]} />
        </View>
      ))}
    </View>
  );
}

function InfoTable({ info }: { info?: { label: string; value: string }[] }) {
  const list = (info ?? []).filter((i) => i.label);
  if (!list.length) return null;
  return (
    <View style={{ marginTop: 4, marginBottom: 6, borderTopWidth: 0.5, borderTopColor: C.line }}>
      {list.map((i, k) => (
        <View key={k} style={s.infoRow} wrap={false}>
          <Text style={s.infoLabel}>{i.label}</Text>
          <Text style={s.infoValue}>{i.value || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionsTable({ actions }: { actions?: { action: string; owner?: string; due?: string }[] }) {
  const list = (actions ?? []).filter((a) => a.action?.trim());
  if (!list.length) return null;
  const row = (a: { action: string; owner?: string; due?: string }, i: number) => (
    <View key={i} style={s.tr} wrap={false}>
      <Text style={[s.td, { width: 22, color: C.faint }]}>{i + 1}</Text>
      <Text style={[s.td, { flex: 1 }]}>{a.action}</Text>
      <Text style={[s.td, { width: 120 }]}>{a.owner || "—"}</Text>
      <Text style={[s.td, { width: 80 }]}>{a.due ? (a.due.match(/^\d{4}-\d{2}-\d{2}$/) ? a.due.split("-").reverse().join("/") : a.due) : "—"}</Text>
    </View>
  );
  return (
    <View>
      <View wrap={false}>
        <View style={[s.h2Bar, { marginTop: 14 }]} />
        <Text style={[s.h2, { marginTop: 0 }]}>Plan d&apos;actions</Text>
        <View style={s.th}>
          <Text style={[s.thCell, { width: 22 }]}>#</Text>
          <Text style={[s.thCell, { flex: 1 }]}>Action</Text>
          <Text style={[s.thCell, { width: 120 }]}>Responsable</Text>
          <Text style={[s.thCell, { width: 80 }]}>Échéance</Text>
        </View>
        {row(list[0], 0)}
      </View>
      {list.slice(1).map((a, i) => row(a, i + 1))}
    </View>
  );
}

export type StatementRow = { date: string; ref: string; label: string; debit: number; credit: number };

function Statement({ rows, period }: { rows: StatementRow[]; period?: { from?: string; to?: string } }) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  const totD = sorted.reduce((a, r) => a + r.debit, 0), totC = sorted.reduce((a, r) => a + r.credit, 0);
  return (
    <View>
      <View style={[s.grid2, { marginTop: 4, marginBottom: 14 }]} wrap={false}>
        {[["Total facturé", totD, C.ink], ["Total réglé", totC, C.green], ["Solde restant dû", totD - totC, totD - totC > 0 ? C.red : C.green]].map(([l, v, c], i) => (
          <View key={i} style={[s.condCard, i === 2 ? { backgroundColor: C.soft, borderColor: C.soft } : {}]}>
            <Text style={s.cardLabel}>{l as string}</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: c as string }}>{money(v as number)} <Text style={{ fontSize: 8, color: C.muted }}>DA</Text></Text>
          </View>
        ))}
      </View>
      <View style={s.th} wrap={false}>
        <Text style={[s.thCell, { width: 62 }]}>Date</Text>
        <Text style={[s.thCell, { width: 84 }]}>Pièce</Text>
        <Text style={[s.thCell, { flex: 1 }]}>Libellé</Text>
        <Text style={[s.thCell, { width: 70, textAlign: "right" }]}>Débit</Text>
        <Text style={[s.thCell, { width: 70, textAlign: "right" }]}>Crédit</Text>
        <Text style={[s.thCell, { width: 76, textAlign: "right" }]}>Solde</Text>
      </View>
      {sorted.length === 0 ? <Text style={{ padding: 10, color: C.muted }}>Aucune opération sur la période.</Text> : null}
      {sorted.map((r, i) => {
        bal += r.debit - r.credit;
        return (
          <View key={i} style={[s.tr, i % 2 ? { backgroundColor: "#fbfbfa" } : {}]} wrap={false}>
            <Text style={[s.td, { width: 62 }]}>{r.date.split("-").reverse().join("/")}</Text>
            <Text style={[s.td, { width: 84, color: C.muted }]}>{r.ref}</Text>
            <Text style={[s.td, { flex: 1 }]}>{r.label}</Text>
            <Text style={[s.td, { width: 70, textAlign: "right" }]}>{r.debit ? money(r.debit) : ""}</Text>
            <Text style={[s.td, { width: 70, textAlign: "right", color: C.green }]}>{r.credit ? money(r.credit) : ""}</Text>
            <Text style={[s.td, { width: 76, textAlign: "right", fontWeight: 600, color: C.ink }]}>{money(bal)}</Text>
          </View>
        );
      })}
      <View style={[s.tr, { borderBottomWidth: 0, backgroundColor: C.soft }]} wrap={false}>
        <Text style={[s.td, { flex: 1, fontWeight: 700, color: C.ink }]}>Totaux {period?.from ? `du ${period.from.split("-").reverse().join("/")} au ${(period.to ?? "").split("-").reverse().join("/")}` : ""}</Text>
        <Text style={[s.td, { width: 70, textAlign: "right", fontWeight: 700 }]}>{money(totD)}</Text>
        <Text style={[s.td, { width: 70, textAlign: "right", fontWeight: 700, color: C.green }]}>{money(totC)}</Text>
        <Text style={[s.td, { width: 76, textAlign: "right", fontWeight: 700, color: C.ink }]}>{money(totD - totC)}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */
export type PdfInput = {
  doc: Doc;
  company: Company;
  client: ClientInfo;
  contact?: ContactInfo;
  dealTitle?: string | null;
  statement?: StatementRow[];
};

export function DocumentPdf({ doc, company: co, client, contact, dealTitle, statement }: PdfInput) {
  const meta = DOC_KINDS[doc.kind];
  const d = doc.data ?? {};
  const validity = d.conditions?.validity_days;
  const wm = doc.status === "brouillon" ? "BROUILLON" : doc.status === "annule" ? "ANNULÉ" : null;

  const metaItems: { label: string; value?: string | null }[] = [{ label: "Date", value: dateFr(doc.issue_date) }];
  if (doc.kind === "devis" || doc.kind === "proposition" || doc.kind === "proforma") metaItems.push({ label: "Valable jusqu'au", value: validity ? dateFr(plus(doc.issue_date, validity)) : null });
  if (doc.kind === "facture") metaItems.push({ label: "Échéance", value: doc.due_date ? dateFr(doc.due_date) : "À réception" });
  if (doc.kind === "bon_commande") metaItems.push({ label: "Réf. client", value: d.client_ref || null });
  if (doc.kind === "etat_compte") metaItems.push({ label: "Période", value: d.period?.from ? `${d.period.from.split("-").reverse().join("/")} → ${(d.period.to ?? "").split("-").reverse().join("/")}` : null });
  metaItems.push({ label: "Projet", value: dealTitle ?? null });
  if (doc.kind === "facture") metaItems.push({ label: "Règlement", value: d.payment_method || null });

  const wordsPrefix =
    doc.kind === "facture" ? "Arrêtée la présente facture à la somme de :"
    : doc.kind === "proforma" ? "Arrêtée la présente facture proforma à la somme de :"
    : doc.kind === "bon_commande" ? "Arrêté le présent bon de commande à la somme de :"
    : doc.kind === "proposition" ? "Arrêtée la présente proposition à la somme de :"
    : "Arrêté le présent devis à la somme de :";

  const bank = [co.bank_name, co.rib && `RIB : ${co.rib}`].filter(Boolean).join("\n");

  return (
    <Document title={`${meta.pdfTitle} ${doc.number} — ${client.company_name}`} author={co.legal_name} subject={d.object ?? meta.pdfTitle} creator="White G CRM" producer="White G CRM" language="fr-FR">
      <Page size="A4" style={[s.page, { fontFamily: family }]} wrap>
        {wm ? <Text style={s.stamp} fixed>{wm}</Text> : null}
        <Header co={co} />
        <Footer co={co} />
        <PageNumber />

        <TitleBlock doc={doc} client={client} contact={contact} heading={meta.pdfTitle} />
        <MetaRow items={metaItems} />
        {d.object ? <Text style={s.object}>Objet : {d.object}</Text> : null}
        {d.intro ? <View style={{ marginBottom: 6 }}><Rich text={d.intro} /></View> : null}

        {meta.blocks.includes("info") ? <InfoTable info={d.info} /> : null}

        {meta.blocks.includes("participants") && d.participants?.trim() ? (
          <View wrap={false}>
            <View style={[s.h2Bar, { marginTop: 14 }]} />
            <Text style={[s.h2, { marginTop: 0 }]}>Participants</Text>
            <Rich text={d.participants} />
          </View>
        ) : null}

        {meta.blocks.includes("sections") ? <Sections sections={d.sections} /> : null}
        {meta.blocks.includes("articles") ? <Articles articles={d.articles} /> : null}

        {meta.priced ? (
          <View>
            <LinesTable lines={d.lines ?? []} heading={doc.kind === "proposition" ? "Investissement" : undefined} />
            <Totals d={d} doc={doc} wordsPrefix={wordsPrefix} />
            <Conditions
              items={[
                { title: "Conditions de paiement", body: d.conditions?.payment },
                { title: doc.kind === "bon_commande" ? "Livraison" : "Délais d'exécution", body: doc.kind === "bon_commande" ? d.conditions?.delivery : d.conditions?.delay },
                { title: "Validité de l'offre", body: (doc.kind === "devis" || doc.kind === "proposition" || doc.kind === "proforma") && validity ? `${validity} jours à compter de la date d'émission.` : null },
                { title: "Coordonnées bancaires", body: doc.kind === "facture" || doc.kind === "proforma" ? bank || null : null },
                { title: "Remarques", body: d.conditions?.notes },
              ]}
            />
          </View>
        ) : null}

        {meta.blocks.includes("actions") ? <ActionsTable actions={d.actions} /> : null}
        {meta.blocks.includes("statement") ? <Statement rows={statement ?? []} period={d.period} /> : null}

        {d.signatures ? (
          <Signatures
            co={co}
            left={`Pour ${co.trade_name}`}
            right={doc.kind === "devis" || doc.kind === "proposition" ? "Bon pour accord — Le Client" : doc.kind === "bon_commande" ? "Le Client (commande ferme)" : doc.kind === "cahier_charges" || doc.kind === "rapport_final" ? "Validation client" : doc.kind === "ordre_mission" ? "L'intervenant" : "Pour le Client"}
          />
        ) : null}

        {doc.kind === "contrat" || doc.kind === "nda" ? (
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 10 }}>Fait en deux exemplaires originaux, le {dateFr(doc.issue_date)}.</Text>
        ) : null}
      </Page>
    </Document>
  );
}
