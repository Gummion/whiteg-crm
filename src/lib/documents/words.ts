// Montant en toutes lettres (français), requis sur les factures en Algérie.
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return TENS[t] + " et un";
    return TENS[t] + "-" + UNITS[u];
  }
  if (n < 80) return n === 71 ? "soixante et onze" : "soixante-" + UNITS[n - 60];
  if (n === 80) return "quatre-vingts";
  return "quatre-vingt-" + UNITS[n - 80];
}

function below1000(n: number, plural = true): string {
  const h = Math.floor(n / 100), r = n % 100;
  let s = "";
  if (h === 1) s = "cent";
  else if (h > 1) s = UNITS[h] + " cent" + (r === 0 && plural ? "s" : "");
  if (r > 0) {
    let w = below100(r);
    if (!plural && r === 80) w = "quatre-vingt"; // « quatre-vingt mille »
    s = s ? s + " " + w : w;
  }
  return s;
}

export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1e3;
  if (billions) parts.push(below1000(billions) + (billions > 1 ? " milliards" : " milliard"));
  if (millions) parts.push(below1000(millions) + (millions > 1 ? " millions" : " million"));
  if (thousands) parts.push(thousands === 1 ? "mille" : below1000(thousands, false) + " mille");
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const total = Math.round(Math.abs(amount) * 100);
  const dinars = Math.floor(total / 100), cents = total % 100;
  let s = numberToWords(dinars) + (dinars > 1 ? " dinars algériens" : " dinar algérien");
  if (cents) s += " et " + numberToWords(cents) + (cents > 1 ? " centimes" : " centime");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
