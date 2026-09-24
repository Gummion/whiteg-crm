export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0)).replace(/ | /g, " ");
