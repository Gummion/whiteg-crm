"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import type { Doc } from "@/lib/documents/config";
import { DOC_KINDS, DOC_STATUS } from "@/lib/documents/config";
import { downloadPdf } from "@/lib/documents/data";
import { money } from "@/lib/documents/money";
import { fmtDate } from "@/lib/format";
import { Badge } from "../ui";

export function DocStatusBadge({ status }: { status: Doc["status"] }) {
  return <Badge color={DOC_STATUS[status].color}>{DOC_STATUS[status].label}</Badge>;
}

export function DocRow({ d, showClient }: { d: Doc; showClient?: boolean }) {
  const [busy, setBusy] = useState(false);
  const meta = DOC_KINDS[d.kind];
  const dl = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setBusy(true);
    try { await downloadPdf(d); } finally { setBusy(false); }
  };
  return (
    <Link href={`/documents/${d.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-panel-2/60 sm:px-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><FileText className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{meta.label} <span className="font-normal text-faint">· {d.number}</span></p>
        <p className="truncate text-xs text-faint">
          {showClient && d.clients ? d.clients.company_name + " · " : ""}{d.data?.object ?? d.title ?? ""}
        </p>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        {meta.priced && <p className="text-sm font-medium tabular-nums">{money(d.total_ttc)} DA</p>}
        <p className="text-xs text-faint">{fmtDate(d.issue_date)}</p>
      </div>
      <div className="shrink-0"><DocStatusBadge status={d.status} /></div>
      <button onClick={dl} className="shrink-0 rounded-md p-2 text-faint hover:bg-panel-2 hover:text-brand" title="Télécharger le PDF" aria-label="Télécharger le PDF">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
    </Link>
  );
}
