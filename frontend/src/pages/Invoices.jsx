import React, { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconInvoice, IconPlus, IconEdit, IconTrash, IconCheck } from "../components/Icons";
import { F, Grid, ltr, useForm } from "../components/Form";
import { useBiz, upsert, remove, nextNo, uid, totals, fmt, getDue, todayStr } from "../services/biz";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function printDoc(inv, biz, t, locale) {
  const tt = totals(inv);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const rows = inv.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.desc)}</td><td>${esc(i.qty)}</td><td>${fmt(i.price)}</td><td>${fmt((i.qty || 0) * (i.price || 0))}</td></tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html dir="${dir}" lang="${locale}"><head><meta charset="utf-8"><title>${esc(inv.no)}</title>
<style>body{font-family:Arial,Tahoma,sans-serif;margin:28px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:18px 0}
th,td{border:1px solid #bbb;padding:7px 9px;text-align:start}th{background:#eee}.meta{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
.tot{margin-inline-start:auto;width:280px}.tot div{display:flex;justify-content:space-between;padding:4px 0}.g{font-weight:700;font-size:1.15em;border-top:2px solid #111}
.sig{margin-top:60px;display:flex;justify-content:space-between}.sig span{border-top:1px solid #111;padding-top:6px;width:200px;text-align:center}</style></head><body>
<div class="meta"><div><h1>${esc(biz.name || "")}</h1><div>${t(inv.type === "quote" ? "inv_quote" : "inv_invoice")} <b>${esc(inv.no)}</b></div></div>
<div><div>${t("inv_issue")}: ${esc(inv.issueDate)}</div><div>${t("inv_due")}: ${esc(inv.dueDate || "-")}</div><div>${t("inv_customer")}: <b>${esc(inv.customer)}</b></div></div></div>
<table><thead><tr><th>#</th><th>${t("inv_desc")}</th><th>${t("inv_qty")}</th><th>${t("inv_price")}</th><th>${t("b_total")}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>${t("inv_sub")}</span><span>${fmt(tt.sub)}</span></div>
<div><span>${t("inv_discAmt")}</span><span>- ${fmt(tt.disc)}</span></div><div><span>${t("inv_taxAmt")}</span><span>${fmt(tt.tax)}</span></div>
<div class="g"><span>${t("inv_total")}</span><span>${fmt(tt.total)} ${esc(inv.currency)}</span></div></div>
<p>${esc(inv.notes)}</p><div class="sig"><span>${t("inv_signature")}</span><span>${t("inv_customer")}</span></div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`);
  w.document.close();
  return true;
}

export default function Invoices() {
  const { t, locale, toast } = useApp();
  const biz = useBiz();
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [f, set, setF] = useForm({});
  useEffect(() => { api.get("/contacts").then((d) => setContacts(d.items || [])).catch(() => {}); }, []);

  const due = getDue(biz);
  const today = todayStr();
  const blank = (type) => ({
    type, customer: "", issueDate: today, dueDate: "", currency: biz.currency, discount: 0, tax: biz.taxRate, notes: "",
    status: type === "quote" ? "draft" : "unpaid", items: [{ desc: "", qty: 1, price: "" }],
  });
  const open = (x) => { setF(typeof x === "string" ? blank(x) : { ...x, items: x.items.map((i) => ({ ...i })) }); setModal(x); };
  const setItem = (n, k, v) => setF((p) => ({ ...p, items: p.items.map((it, i) => (i === n ? { ...it, [k]: v } : it)) }));

  const save = (e) => {
    e.preventDefault();
    const isNew = typeof modal === "string";
    const base = isNew ? { id: uid(), no: nextNo(f.type), createdAt: new Date().toISOString() } : modal;
    upsert("invoices", { ...base, ...f, items: f.items.filter((i) => i.desc || i.price) });
    setModal(null);
  };
  const markPaid = (x) => upsert("invoices", { ...x, status: "paid", paidAt: today });
  const toInvoice = (x) => upsert("invoices", { ...x, type: "invoice", no: nextNo("invoice"), status: "unpaid", issueDate: today });

  const isOverdue = (x) => x.type === "invoice" && x.status === "unpaid" && x.dueDate && x.dueDate < today;
  const dueIds = new Set(due.map((d) => d.inv.id));
  const list = useMemo(() => biz.invoices.filter((x) => filter === "all" || (filter === "due" ? dueIds.has(x.id) : x.type === filter)), [biz.invoices, filter, due.length]); // eslint-disable-line
  const sum = (st) => biz.invoices.filter((x) => x.type === "invoice" && x.status === st).reduce((a, x) => a + totals(x).total, 0);
  const stBadge = { draft: "", unpaid: "badge-violet", paid: "badge-green", cancelled: "badge-red" };
  const tt = modal ? totals(f.items ? f : { items: [] }) : null;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title">
        <h2>{t("invoices")}</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => open("quote")}><IconPlus />{t("inv_quote")}</button>
          <button className="btn btn-primary btn-sm" onClick={() => open("invoice")}><IconPlus />{t("inv_invoice")}</button>
        </div>
      </div>
      {due.length > 0 && (
        <div className="glass card" style={{ borderColor: "rgba(255,107,129,.5)" }}>
          <strong>🔔 {due.length} {t("inv_dueBanner")}</strong>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-2)", marginTop: "0.3rem" }}>
            {due.slice(0, 4).map((d) => `${d.inv.no} · ${d.inv.customer} · ${d.inv.dueDate}${d.overdue ? " ⚠" : ""}`).map((s, i) => <div key={i} dir="auto">{s}</div>)}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: "0.5rem" }} onClick={() => setFilter("due")}>{t("inv_dueFilter")}</button>
        </div>
      )}
      <div className="stat-grid">
        <div className="glass stat-card"><div className="stat-label">{t("inv_unpaidSum")}</div><div className="stat-value">{fmt(sum("unpaid"))}</div></div>
        <div className="glass stat-card"><div className="stat-label">{t("inv_paidSum")}</div><div className="stat-value">{fmt(sum("paid"))}</div></div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {[["all", "inv_all"], ["invoice", "inv_invoice"], ["quote", "inv_quote"], ["due", "inv_dueFilter"]].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(k)}>{t(l)}</button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState icon={<IconInvoice />} text={t("b_none")} /> : (
        <div style={{ display: "grid", gap: "0.7rem" }}>
          {list.map((x) => (
            <div key={x.id} className="glass card" style={{ display: "grid", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
                <strong dir="ltr">{x.no}</strong>
                <span>
                  {isOverdue(x) && <span className="badge badge-red">{t("inv_overdue")} </span>}
                  <span className={`badge ${stBadge[x.status]}`}>{t("inv_" + x.status)}</span>
                </span>
              </div>
              <div>{x.customer || "—"} <span style={{ color: "var(--text-3)" }}>· {x.dueDate || x.issueDate}</span></div>
              <div style={{ fontWeight: 700 }} dir="ltr">{fmt(totals(x).total)} {x.currency}</div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {x.type === "invoice" && x.status === "unpaid" && <button className="btn btn-ghost btn-sm" onClick={() => markPaid(x)}><IconCheck />{t("inv_markPaid")}</button>}
                {x.type === "quote" && <button className="btn btn-ghost btn-sm" onClick={() => toInvoice(x)}>{t("inv_toInvoice")}</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => { if (!printDoc(x, biz, t, locale)) toast(t("inv_printHint"), "error"); }}>{t("inv_print")}</button>
                <button className="icon-btn" aria-label={t("b_edit")} onClick={() => open(x)}><IconEdit /></button>
                <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel(x)}><IconTrash /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal wide title={`${t(f.type === "quote" ? "inv_quote" : "inv_invoice")} ${f.no || ""}`} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <Grid>
              <F label={t("inv_customer") + " *"}>
                <input className="input" required list="custs" value={f.customer} onChange={set("customer")} />
                <datalist id="custs">{contacts.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </F>
              <F label={t("inv_issue")}><input className="input" type="date" value={f.issueDate} onChange={set("issueDate")} {...ltr} /></F>
              <F label={t("inv_due")}><input className="input" type="date" value={f.dueDate} onChange={set("dueDate")} {...ltr} /></F>
              <F label={t("currency")}><input className="input" maxLength={5} value={f.currency} onChange={set("currency")} {...ltr} /></F>
              <F label={t("status")}><select className="select" value={f.status} onChange={set("status")}>
                {["draft", "unpaid", "paid", "cancelled"].map((k) => <option key={k} value={k}>{t("inv_" + k)}</option>)}</select></F>
            </Grid>
            <h4 style={{ margin: "0.9rem 0 0.4rem" }}>{t("inv_items")}</h4>
            {f.items.map((it, n) => (
              <div key={n} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 36px", gap: "0.4rem", marginBottom: "0.4rem" }}>
                <input className="input" placeholder={t("inv_desc")} value={it.desc} onChange={(e) => setItem(n, "desc", e.target.value)} />
                <input className="input" type="number" min="0" step="any" placeholder={t("inv_qty")} value={it.qty} onChange={(e) => setItem(n, "qty", e.target.value)} {...ltr} />
                <input className="input" type="number" min="0" step="any" placeholder={t("inv_price")} value={it.price} onChange={(e) => setItem(n, "price", e.target.value)} {...ltr} />
                <button type="button" className="icon-btn" aria-label={t("delete")} disabled={f.items.length < 2}
                        onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, i) => i !== n) }))}><IconTrash /></button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((p) => ({ ...p, items: [...p.items, { desc: "", qty: 1, price: "" }] }))}><IconPlus />{t("inv_addItem")}</button>
            <Grid>
              <F label={t("inv_discount")}><input className="input" type="number" min="0" max="100" step="any" value={f.discount} onChange={set("discount")} {...ltr} /></F>
              <F label={t("inv_tax")}><input className="input" type="number" min="0" max="100" step="any" value={f.tax} onChange={set("tax")} {...ltr} /></F>
            </Grid>
            <div className="glass card" style={{ fontSize: "var(--text-sm)" }} dir="ltr">
              <div>{t("inv_sub")}: {fmt(tt.sub)}</div><div>{t("inv_discAmt")}: -{fmt(tt.disc)}</div><div>{t("inv_taxAmt")}: {fmt(tt.tax)}</div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{t("inv_total")}: {fmt(tt.total)} {f.currency}</div>
            </div>
            <F label={t("inv_notes")}><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></F>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove("invoices", del.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
