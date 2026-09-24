"use client";

import { Fragment } from "react";

/** Tiny, safe Markdown renderer (no HTML injection): headings, lists, bold/italic, inline code, tables, rules. */
function inline(text: string, key = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-fg">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={`${key}-${i++}`} className="rounded bg-panel-2 px-1 text-[0.9em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0; let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const lvl = h[1].length;
      const cls = lvl <= 2 ? "mt-5 mb-2 text-base font-semibold text-fg" : "mt-4 mb-1.5 text-sm font-semibold text-fg";
      blocks.push(<p key={k++} className={cls}>{inline(h[2], k)}</p>);
      i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { blocks.push(<hr key={k++} className="my-4 border-line" />); i++; continue; }
    if (isRow(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(l); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      blocks.push(
        <div key={k++} className="my-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-panel-2"><tr>{head.map((c, j) => <th key={j} className="whitespace-nowrap px-3 py-2 font-semibold">{inline(c, j)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} className="border-t border-line/60">{r.map((c, j) => <td key={j} className="px-3 py-1.5 align-top tabular-nums">{inline(c, j)}</td>)}</tr>)}</tbody>
          </table>
        </div>);
      continue;
    }
    if (/^\s*([-*•])\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•])\s+/, "")); i++; }
      blocks.push(<ul key={k++} className="my-2 list-disc space-y-1 pl-5">{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push(<ol key={k++} className="my-2 list-decimal space-y-1 pl-5">{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ol>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s)/.test(lines[i]) && !isRow(lines[i])) { para.push(lines[i]); i++; }
    if (!para.length) { para.push(l); i++; }
    blocks.push(<p key={k++} className="my-2">{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, j)}</Fragment>)}</p>);
  }
  return <div className="text-sm leading-relaxed text-muted">{blocks}</div>;
}
