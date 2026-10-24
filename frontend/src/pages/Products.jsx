import CurrencyPicker from "../components/CurrencyPicker";
import { getBiz } from "../services/biz";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, Spinner, ConfirmDialog } from "../components/UI";
import { IconBox, IconPlus, IconTrash, IconEdit } from "../components/Icons";
import { formatDateTime } from "../i18n";

export default function Products() {
  const { t, locale, toast, tError } = useApp();
  const [products, setProducts] = useState(null);
  const [payments, setPayments] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [prodModal, setProdModal] = useState(null); // "new" | product
  const [prodForm, setProdForm] = useState({ name: "", price: "", currency: getBiz().currency || "USD", notes: "" });
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ product_id: "", contact_id: "", amount: "", currency: getBiz().currency || "USD", note: "" });
  const [deleting, setDeleting] = useState(null); // {type, item}

  const load = useCallback(() => {
    api.get("/products").then((d) => setProducts(d.items)).catch((e) => toast(tError(e), "error"));
    api.get("/payments").then((d) => setPayments(d.items)).catch((e) => toast(tError(e), "error"));
    api.get("/contacts").then((d) => setContacts(d.items)).catch(() => {});
  }, [toast, tError]);
  useEffect(() => { load(); }, [load]);

  const saveProduct = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...prodForm, price: parseFloat(prodForm.price) || 0 };
      if (prodModal === "new") await api.post("/products", payload);
      else await api.patch(`/products/${prodModal.id}`, payload);
      setProdModal(null);
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const savePayment = async (e) => {
    e.preventDefault();
    try {
      await api.post("/payments", {
        product_id: payForm.product_id || null,
        contact_id: payForm.contact_id || null,
        amount: parseFloat(payForm.amount),
        currency: payForm.currency, note: payForm.note,
      });
      setPayModal(false);
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const remove = async () => {
    const { type, item } = deleting;
    try {
      await api.del(`/${type}/${item.id}`);
      load();
    } catch (err) { toast(tError(err), "error"); }
  };

  const productName = (id) => (products || []).find((p) => p.id === id)?.name || "—";
  const contactName = (id) => (contacts || []).find((c) => c.id === id)?.name || "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* products */}
      <div>
        <div className="section-title" style={{ marginTop: 0 }}>
          <h2>{t("products")}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => { setProdModal("new"); setProdForm({ name: "", price: "", currency: getBiz().currency || "USD", notes: "" }); }}>
            <IconPlus />{t("newProduct")}
          </button>
        </div>
        <div className="glass">
          {products === null ? (
            <div style={{ display: "grid", placeItems: "center", padding: "2rem" }}><Spinner /></div>
          ) : products.length === 0 ? (
            <EmptyState icon={<IconBox />} text={t("noProducts")} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("name")}</th><th>{t("price")}</th><th className="hide-sm">{t("currency")}</th>
                    <th className="hide-sm">{t("created")}</th><th style={{ width: 1 }}>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ fontWeight: 600 }}>{p.price}<span className="sm-only"> {p.currency}</span></td>
                      <td className="hide-sm">{p.currency}</td>
                      <td className="hide-sm" style={{ whiteSpace: "nowrap" }}>{formatDateTime(p.created_at, locale)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button className="icon-btn" style={{ width: 36, height: 36 }}
                                  onClick={() => { setProdModal(p); setProdForm({ name: p.name, price: String(p.price), currency: p.currency, notes: p.notes }); }}>
                            <IconEdit style={{ width: 16, height: 16 }} />
                          </button>
                          <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setDeleting({ type: "products", item: p })}>
                            <IconTrash style={{ width: 16, height: 16 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* payments */}
      <div>
        <div className="section-title">
          <h2>{t("newPayment")}</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPayModal(true); setPayForm({ product_id: "", contact_id: "", amount: "", currency: getBiz().currency || "USD", note: "" }); }}>
            <IconPlus />{t("newPayment")}
          </button>
        </div>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", margin: "0 0 0.6rem" }}>{t("paymentsBookkeeping")}</p>
        <div className="glass">
          {payments === null ? (
            <div style={{ display: "grid", placeItems: "center", padding: "2rem" }}><Spinner /></div>
          ) : payments.length === 0 ? (
            <EmptyState icon={<IconBox />} text={t("noPayments")} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("amount")}</th><th className="hide-sm">{t("currency")}</th><th>{t("products")}</th>
                    <th className="hide-sm">{t("contacts")}</th><th className="hide-sm">{t("created")}</th><th style={{ width: 1 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.amount}<span className="sm-only"> {p.currency}</span></td>
                      <td className="hide-sm">{p.currency}</td>
                      <td>{productName(p.product_id)}</td>
                      <td className="hide-sm">{contactName(p.contact_id)}</td>
                      <td className="hide-sm" style={{ whiteSpace: "nowrap" }}>{formatDateTime(p.created_at, locale)}</td>
                      <td>
                        <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setDeleting({ type: "payments", item: p })}>
                          <IconTrash style={{ width: 16, height: 16 }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {prodModal && (
        <Modal title={prodModal === "new" ? t("newProduct") : t("editContact")} onClose={() => setProdModal(null)}>
          <form onSubmit={saveProduct}>
            <div className="field">
              <label>{t("name")} *</label>
              <input className="input" required maxLength={200} value={prodForm.name}
                     onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("price")} *</label>
              <input className="input" type="number" step="0.01" min="0" required dir="ltr" style={{ textAlign: "start" }}
                     value={prodForm.price} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("currency")} *</label>
              <CurrencyPicker value={prodForm.currency} onChange={(v) => setProdForm({ ...prodForm, currency: v })} />
            </div>
            <div className="field">
              <label>{t("notes")} ({t("optional")})</label>
              <textarea className="textarea" value={prodForm.notes} maxLength={2000}
                        onChange={(e) => setProdForm({ ...prodForm, notes: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setProdModal(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}

      {payModal && (
        <Modal title={t("newPayment")} onClose={() => setPayModal(false)}>
          <form onSubmit={savePayment}>
            <div className="field">
              <label>{t("amount")} *</label>
              <input className="input" type="number" step="0.01" min="0.01" required dir="ltr" style={{ textAlign: "start" }}
                     value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div className="field">
              <label>{t("currency")} *</label>
              <CurrencyPicker value={payForm.currency} onChange={(v) => setPayForm({ ...payForm, currency: v })} />
            </div>
            <div className="field">
              <label>{t("products")} ({t("optional")})</label>
              <select className="select" value={payForm.product_id} onChange={(e) => setPayForm({ ...payForm, product_id: e.target.value })}>
                <option value="">—</option>
                {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t("contacts")} ({t("optional")})</label>
              <select className="select" value={payForm.contact_id} onChange={(e) => setPayForm({ ...payForm, contact_id: e.target.value })}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t("paymentsNote")} ({t("optional")})</label>
              <input className="input" maxLength={300} value={payForm.note}
                     onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPayModal(false)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog title={t("confirmDelete")} message={`${t("confirmDelete")}`}
                       onConfirm={remove} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
