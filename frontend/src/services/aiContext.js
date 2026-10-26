/* Builds the assistant's system prompt: what the app is, what it may and may not do,
   and a snapshot of the user's real figures. Every number is computed here in code, never by the model.
   Only aggregates are included (no phone numbers, no per-employee salaries). */
import { getBiz, totals, paidOf, leftOf, fmt, getDue, getLow, stockLeft, payroll } from "./biz";

export function buildSystemPrompt(extra = {}) {
  const b = getBiz(), cur = b.currency, today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const live = b.invoices.filter((x) => x.type === "invoice" && x.status !== "draft" && x.status !== "cancelled");
  const same = live.filter((x) => (x.currency || cur) === cur);
  const exp = b.expenses.filter((x) => x.date.startsWith(month));
  const cats = {}; exp.forEach((x) => { cats[x.category] = (cats[x.category] || 0) + (Number(x.amount) || 0); });
  const due = getDue(b), low = getLow(b), staff = b.employees.filter((e) => e.status !== "ended");
  const lines = [
    `Business: ${b.name || "(unnamed)"} · type: ${b.type} · main currency: ${cur}`,
    `Today: ${today}`,
    `Invoices (${cur}, excluding drafts/cancelled): count ${same.length}; invoiced ${fmt(sum(same, (x) => totals(x).total))}; collected ${fmt(sum(same, paidOf))}; outstanding ${fmt(sum(same, leftOf))}`,
    `Due or overdue unpaid invoices: ${due.length}` + (due.length ? " → " + due.slice(0, 5).map((d) => `${d.inv.no} ${d.inv.customer} due ${d.inv.dueDate} remaining ${fmt(leftOf(d.inv))}${d.overdue ? " OVERDUE" : ""}`).join("; ") : ""),
    `Quotes: ${b.invoices.filter((x) => x.type === "quote").length}`,
    `Expenses this month (${month}): total ${fmt(sum(exp, (x) => Number(x.amount) || 0))}` + (Object.keys(cats).length ? " → " + Object.entries(cats).map(([k, v]) => `${k} ${fmt(v)}`).join(", ") : ""),
    `Inventory: ${b.inventory.length} items; low or out of stock: ${low.length}` + (low.length ? " → " + low.slice(0, 8).map((i) => `${i.name} (${stockLeft(i)} left)`).join(", ") : ""),
    `Product catalog: ${b.catalog.length} products`,
    `Employees (not terminated): ${staff.length}; total net payroll this period: ${fmt(sum(staff, (e) => payroll(e).net))}`,
    `Map places saved: ${b.places.length}`,
    `Contacts: ${extra.contacts ?? "?"} · open tasks: ${extra.tasksOpen ?? "?"} · documents: ${extra.documents ?? "?"}`,
  ];
  return [
    'You are the built-in assistant of "Wassilha AI" (وصّله), a bilingual business management web app for shops, contractors, workshops, factories, companies and service organizations.',
    "Answer in the user's language (Arabic unless they write otherwise), briefly and practically.",
    "App sections: Home, Contacts, Messages, Tasks, Calendar, Documents, Insights, Products (old list + payments), Product catalog (prices, offers with dates, photos/videos, interested customers with call/WhatsApp), Inventory (in/out/remaining, low-stock alert, unit conversion), Invoices and quotes (items, discount, tax, deposits, due dates, print/PDF), Expenses, Reports (sales, collected, outstanding, expenses, profit, CSV export), Employees (levels, payroll with bonuses/overtime/advances/penalties/income tax), Map (customers/stores, draggable pin), AI models (provider keys), Business setup (sections on/off, names, currency, backup/restore).",
    "Data is stored in the user's own browser; there is no cloud sync yet. Backup/restore lives in Business setup.",
    "RULES: You are read-only. You cannot create, edit, delete, send or pay anything, so never claim you did; instead tell the user which section and button to use. Use ONLY the snapshot below for facts about this business; if something is not in it, say you do not have it and point to the section where it lives. Never do new arithmetic on money: quote the figures given or send the user to Reports. Never invent customers, amounts, dates or prices. Financial or legal decisions are the user's; offer options, not orders.",
    "SNAPSHOT (computed by the app):",
    ...lines.map((l) => "- " + l),
  ].join("\n");
}
