import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Modal, EmptyState, ConfirmDialog } from "../components/UI";
import { IconUsers, IconPlus, IconEdit, IconTrash } from "../components/Icons";
import CurrencyPicker from "../components/CurrencyPicker";
import Summary from "../components/Summary";
import { F, Grid, Sec, ltr, useForm } from "../components/Form";
import { useBiz, upsert, remove, nextNo, uid, fmt, payroll, service, todayStr } from "../services/biz";

const BLANK = {
  fullName: "", gender: "", birthDate: "", nationalId: "", nationality: "", maritalStatus: "", children: "",
  phone: "", email: "", address: "", ecName: "", ecPhone: "",
  jobTitle: "", department: "", branch: "", manager: "", empType: "full_time", hireDate: "", contractEnd: "", workHours: "", leaveBalance: "",
  payType: "monthly", salary: "", currency: "", payMethod: "", insuranceNo: "", status: "active", skills: "", notes: "",
  role: "", propId: "", level: "employee", taxRate: "", ssNo: "", health: "", injury: "", adj: [],
};

export default function Employees() {
  const { t } = useApp();
  const biz = useBiz();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // "new" | employee
  const [del, setDel] = useState(null);
  const [f, set, setF] = useForm(BLANK);
  const [row, setRow] = useState({ kind: "bonus", amount: "", date: todayStr(), note: "" });
  const pr = payroll(f);

  const open = (emp) => {
    setF(emp === "new" ? { ...BLANK, currency: biz.currency } : { ...BLANK, ...emp });
    setModal(emp);
  };
  const save = (e) => {
    e.preventDefault();
    const base = modal === "new" ? { id: uid(), no: nextNo("employee"), createdAt: new Date().toISOString() } : modal;
    upsert("employees", { ...base, ...f });
    setModal(null);
  };

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return biz.employees.filter((x) => !s || [x.fullName, x.jobTitle, x.department, x.branch, x.phone, x.no].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [biz.employees, q]);
  const live = biz.employees.filter((x) => x.status !== "ended");
  const payrollSum = live.reduce((a, x) => a + payroll(x).net, 0);
  const stBadge = { probation: "badge-violet", active: "badge-green", leave: "badge-blue", ended: "badge-red" };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="section-title">
        <h2>{t("employees")} <span className="badge">{biz.employees.length} {t("emp_count")}</span></h2>
        <button className="btn btn-primary btn-sm" onClick={() => open("new")}><IconPlus />{t("emp_new")}</button>
      </div>
      {biz.employees.length > 0 && (
        <div className="stat-grid">
          <div className="glass stat-card"><div className="stat-label">{t("emp_payroll")}</div><div className="stat-value">{fmt(payrollSum)} {biz.currency}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("emp_probation")}</div><div className="stat-value">{biz.employees.filter((x) => x.status === "probation").length}</div></div>
          <div className="glass stat-card"><div className="stat-label">{t("emp_active")}</div><div className="stat-value">{biz.employees.filter((x) => x.status === "active").length}</div></div>
        </div>
      )}
      <input className="input" placeholder={t("b_search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? (
        <EmptyState icon={<IconUsers />} text={t("b_none")} />
      ) : (
        <div style={{ display: "grid", gap: "0.7rem" }}>
          {list.map((x) => {
            const p = payroll(x);
            return (
              <div key={x.id} className="glass card" style={{ display: "grid", gap: "0.6rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: "1.05rem" }}>{x.fullName}</strong>
                    <div style={{ color: "var(--text-3)", fontSize: "var(--text-sm)" }}>{x.jobTitle}{x.jobTitle && " · "}{t("lvl_" + (x.level || "employee"))}</div>
                  </div>
                  <span className={`badge ${stBadge[x.status] || ""}`}>{t("emp_" + (x.status === "ended" ? "ended" : x.status))}</span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem 0.9rem", flexWrap: "wrap", fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
                  <bdi dir="ltr">{x.no}</bdi>
                  {x.department && <span>🏢 {x.department}</span>}
                  {x.branch && <span>📍 {x.branch}</span>}
                  {x.phone && <a href={`tel:${x.phone}`} dir="ltr" style={{ color: "inherit" }}>📞 {x.phone}</a>}
                </div>
                <div className="mini3">
                  {[[t("emp_total"), p.base], [t("emp_deductions"), p.base - p.afterDed], [t("emp_net"), p.net]].map(([l, v], k) => (
                    <div key={k}><small>{l}</small><b dir="ltr" style={k === 2 ? { color: "#4ade80" } : k === 1 && v > 0 ? { color: "#ff8a9b" } : undefined}>{fmt(v)}</b></div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => open(x)}><IconEdit />{t("b_edit")}</button>
                  <button className="icon-btn" aria-label={t("delete")} onClick={() => setDel(x)}><IconTrash /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal wide title={modal === "new" ? t("emp_new") : f.fullName} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <Sec>{t("emp_sec_personal")}</Sec>
            <Grid>
              <F label={t("emp_full") + " *"} wide><input className="input" required maxLength={200} value={f.fullName} onChange={set("fullName")} /></F>
              <F label={t("emp_gender")}><select className="select" value={f.gender} onChange={set("gender")}><option value="" /><option value="male">{t("emp_male")}</option><option value="female">{t("emp_female")}</option></select></F>
              <F label={t("emp_birth")}><input className="input" type="date" value={f.birthDate} onChange={set("birthDate")} {...ltr} /></F>
              <F label={t("emp_nid")}><input className="input" value={f.nationalId} onChange={set("nationalId")} {...ltr} /></F>
              <F label={t("emp_nation")}><input className="input" value={f.nationality} onChange={set("nationality")} /></F>
              <F label={t("emp_marital")}><select className="select" value={f.maritalStatus} onChange={set("maritalStatus")}><option value="" /><option value="single">{t("emp_single")}</option><option value="married">{t("emp_married")}</option><option value="other">{t("emp_other")}</option></select></F>
              <F label={t("emp_children")}><input className="input" type="number" min="0" value={f.children} onChange={set("children")} {...ltr} /></F>
            </Grid>
            <Sec>{t("emp_sec_contact")}</Sec>
            <Grid>
              <F label={t("emp_phone")}><input className="input" type="tel" value={f.phone} onChange={set("phone")} {...ltr} /></F>
              <F label={t("emp_email")}><input className="input" type="email" value={f.email} onChange={set("email")} {...ltr} /></F>
              <F label={t("emp_addr")} wide><input className="input" value={f.address} onChange={set("address")} /></F>
              <F label={t("emp_ecName")}><input className="input" value={f.ecName} onChange={set("ecName")} /></F>
              <F label={t("emp_ecPhone")}><input className="input" type="tel" value={f.ecPhone} onChange={set("ecPhone")} {...ltr} /></F>
            </Grid>
            <Sec>{t("emp_sec_job")}</Sec>
            <Grid>
              <F label={t("emp_title")}><input className="input" value={f.jobTitle} onChange={set("jobTitle")} /></F>
              <F label={t("role_label")}><select className="select" value={f.role || ""} onChange={set("role")}><option value="">—</option>{["manager", "chef", "sous", "waiter", "cashier", "cleaner", "driver", "dishwasher", "other"].map((k) => <option key={k} value={k}>{t("role_" + k)}</option>)}</select></F>
              {biz.props.length > 0 && <F label={t("pr_building")}><select className="select" value={f.propId || ""} onChange={set("propId")}><option value="">—</option>{biz.props.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>}
              <F label={t("emp_dept")}><input className="input" value={f.department} onChange={set("department")} /></F>
              <F label={t("emp_branch")}><input className="input" value={f.branch} onChange={set("branch")} /></F>
              <F label={t("emp_manager")}>
                <input className="input" list="mgrs" value={f.manager} onChange={set("manager")} />
                <datalist id="mgrs">{biz.employees.map((x) => <option key={x.id} value={x.fullName} />)}</datalist>
              </F>
              <F label={t("emp_type")}><select className="select" value={f.empType} onChange={set("empType")}>
                {["full_time", "part_time", "contract", "daily", "intern"].map((k) => <option key={k} value={k}>{t("emp_" + k)}</option>)}</select></F>
              <F label={t("emp_status")}><select className="select" value={f.status} onChange={set("status")}>
                {["active", "probation", "leave", "ended"].map((k) => <option key={k} value={k}>{t("emp_" + k)}</option>)}</select></F>
              <F label={t("emp_level")}><select className="select" value={f.level} onChange={set("level")}>
                {["manager", "head", "employee", "subordinate"].map((k) => <option key={k} value={k}>{t("lvl_" + k)}</option>)}</select></F>
              <F label={t("emp_hire")}><input className="input" type="date" value={f.hireDate} onChange={set("hireDate")} {...ltr} /></F>
              <F label={t("emp_contractEnd")}><input className="input" type="date" value={f.contractEnd} onChange={set("contractEnd")} {...ltr} /></F>
              <F label={t("emp_hours")}><input className="input" value={f.workHours} onChange={set("workHours")} /></F>
              <F label={t("emp_leaveBal")}><input className="input" type="number" min="0" value={f.leaveBalance} onChange={set("leaveBalance")} {...ltr} /></F>
            </Grid>
            <Sec>{t("emp_sec_pay")}</Sec>
            <Grid>
              <F label={t("emp_payType")}><select className="select" value={f.payType} onChange={set("payType")}>
                {[["monthly", "emp_monthly"], ["daily", "emp_dailyPay"], ["hourly", "emp_hourly"], ["piece", "emp_piece"]].map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></F>
              <F label={t("emp_salary")}><input className="input" type="number" step="0.01" min="0" value={f.salary} onChange={set("salary")} {...ltr} /></F>
              <F label={t("currency")}><CurrencyPicker value={f.currency} onChange={(v) => setF((p) => ({ ...p, currency: v }))} /></F>
              <F label={t("emp_payMethod")}><input className="input" value={f.payMethod} onChange={set("payMethod")} /></F>
              <F label={t("emp_taxRate")}><input className="input" type="number" min="0" max="100" step="any" value={f.taxRate} onChange={set("taxRate")} {...ltr} /></F>
              <F label={t("emp_insurance")}><input className="input" value={f.insuranceNo} onChange={set("insuranceNo")} {...ltr} /></F>
              <F label={t("emp_ss")}><input className="input" value={f.ssNo} onChange={set("ssNo")} {...ltr} /></F>
              <F label={t("emp_health")}><input className="input" value={f.health} onChange={set("health")} /></F>
              <F label={t("emp_injury")} wide><input className="input" value={f.injury} onChange={set("injury")} /></F>
            </Grid>
            <Sec>{t("emp_sec_adj")}</Sec>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
              <select className="select" value={row.kind} onChange={(e) => setRow({ ...row, kind: e.target.value })}>
                {["bonus", "overtime", "advance", "penalty"].map((k) => <option key={k} value={k}>{t("adj_" + k)}</option>)}</select>
              <input className="input" type="number" min="0" step="any" placeholder={t("amount")} value={row.amount} onChange={(e) => setRow({ ...row, amount: e.target.value })} {...ltr} />
              <input className="input" type="date" value={row.date} onChange={(e) => setRow({ ...row, date: e.target.value })} {...ltr} />
              <input className="input" placeholder={t("emp_notes")} value={row.note} onChange={(e) => setRow({ ...row, note: e.target.value })} />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ margin: "0.4rem 0" }} onClick={() => {
              if (!(Number(row.amount) > 0)) return;
              setF((p) => ({ ...p, adj: [...(p.adj || []), { id: uid(), ...row }] })); setRow({ ...row, amount: "", note: "" });
            }}><IconPlus />{t("b_add")}</button>
            {(f.adj || []).map((a) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "0.25rem 0", borderTop: "1px solid var(--border)" }}>
                <span>{t("adj_" + a.kind)} · {a.date} {a.note && `· ${a.note}`}</span>
                <span dir="ltr">{a.kind === "bonus" || a.kind === "overtime" ? "+" : "−"}{fmt(a.amount)}
                  <button type="button" className="icon-btn" aria-label={t("delete")} onClick={() => setF((p) => ({ ...p, adj: p.adj.filter((x) => x.id !== a.id) }))}><IconTrash /></button></span>
              </div>
            ))}
            <div style={{ marginTop: "0.6rem" }}><Summary cur={f.currency} rows={[
              { label: t("emp_total"), value: pr.base, sub: true },
              { label: t("adj_advance"), value: pr.adv, tone: "minus" }, { label: t("adj_penalty"), value: pr.pen, tone: "minus" }, { label: t("emp_tax"), value: pr.tax, tone: "minus" },
              { label: t("emp_afterDed"), value: pr.afterDed, sub: true },
              { label: `${t("adj_bonus")} / ${t("adj_overtime")}`, value: pr.bonus, tone: "plus" },
              f.hireDate && { label: t("emp_service"), text: service(f), tone: "muted" },
            ]} total={{ label: t("emp_net"), value: pr.net }} /></div>
            <Sec>{t("emp_sec_more")}</Sec>
            <F label={t("emp_skills")}><textarea className="textarea" rows={2} value={f.skills} onChange={set("skills")} /></F>
            <F label={t("emp_notes")}><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></F>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "flex-end", marginTop: "0.8rem" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>{t("cancel")}</button>
              <button className="btn btn-primary btn-sm">{t("save")}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && <ConfirmDialog title={t("delete")} message={t("b_confirmDelete")} onConfirm={() => remove("employees", del.id)} onClose={() => setDel(null)} />}
    </div>
  );
}
