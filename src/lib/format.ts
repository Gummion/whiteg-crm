import { format, formatDistanceToNowStrict, isPast, isToday, isTomorrow } from "date-fns";
import { fr } from "date-fns/locale";

export const fmtDA = (n: number | null | undefined) =>
  new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Number(n ?? 0)).replace(/ | /g, " ") + " DA";

export const fmtCompactDA = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(".", ",") + " M DA";
  if (Math.abs(v) >= 1_000) return Math.round(v / 1_000) + " k DA";
  return v + " DA";
};

export const fmtDate = (d: string | null | undefined) => (d ? format(new Date(d), "d MMM yyyy", { locale: fr }) : "—");
export const fmtDateTime = (d: string | null | undefined) => (d ? format(new Date(d), "d MMM · HH:mm", { locale: fr }) : "—");
export const fmtAgo = (d: string | null | undefined) =>
  d ? formatDistanceToNowStrict(new Date(d), { locale: fr, addSuffix: true }) : "jamais";

export function dueLabel(d: string | null) {
  if (!d) return { text: "Sans échéance", tone: "muted" as const };
  const date = new Date(d);
  if (isPast(date) && !isToday(date)) return { text: "En retard · " + format(date, "d MMM", { locale: fr }), tone: "danger" as const };
  if (isToday(date)) return { text: (isPast(date) ? "En retard · " : "Aujourd'hui · ") + format(date, "HH:mm"), tone: isPast(date) ? ("danger" as const) : ("warn" as const) };
  if (isTomorrow(date)) return { text: "Demain · " + format(date, "HH:mm"), tone: "info" as const };
  return { text: format(date, "EEE d MMM · HH:mm", { locale: fr }), tone: "muted" as const };
}

/** value for <input type="datetime-local"> in local time */
export const toLocalInput = (d: string | null | undefined) => {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const initials = (s: string) =>
  s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export const waLink = (phone: string) => {
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("0")) p = "213" + p.slice(1);
  return "https://wa.me/" + p.replace("+", "");
};
