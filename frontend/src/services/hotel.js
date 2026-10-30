/* Hotel logic: nights, availability, guest folio and occupancy KPIs. Pure functions; every amount is computed here, in code. */
export const ACTIVE = ["booked", "checkedin"];
export const nightsBetween = (a, b) => Math.max(Math.round((new Date(b) - new Date(a)) / 864e5), 0);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };

/* a stay occupies the NIGHTS from check-in up to (not including) the check-out day, so a room can be re-let on the departure day */
export const clashes = (stays, s) => stays.filter((x) => x.id !== s.id && x.roomId === s.roomId && ACTIVE.includes(x.status) && x.checkIn < s.checkOut && x.checkOut > s.checkIn);
export const stayOn = (stays, roomId, day) => stays.find((x) => x.roomId === roomId && ACTIVE.includes(x.status) && x.checkIn <= day && day < x.checkOut);

/* guest account: room nights + extra charges, discount and tax on the taxable part; charges already carrying tax (e.g. restaurant) are added as they are */
export function folio(s) {
  const n = nightsBetween(s.checkIn, s.checkOut), room = n * (Number(s.rate) || 0), ch = s.charges || [];
  const line = (c) => (Number(c.qty) || 1) * (Number(c.amount) || 0);
  const extras = ch.filter((c) => !c.taxIncluded).reduce((a, c) => a + line(c), 0), inclTax = ch.filter((c) => c.taxIncluded).reduce((a, c) => a + line(c), 0);
  const sub = room + extras, disc = sub * ((Number(s.discount) || 0) / 100), tax = (sub - disc) * ((Number(s.tax) || 0) / 100);
  const total = sub - disc + tax + inclTax, paid = (s.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { n, room, extras, inclTax, sub, disc, tax, total, paid, balance: total - paid };
}
/* occupancy, average daily rate and revenue per available room for one month (YYYY-MM) */
export function kpis(rooms, stays, month) {
  const first = month + "-01", days = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate(), next = addDays(first, days);
  let nights = 0, revenue = 0;
  stays.filter((s) => s.status !== "cancelled" && s.status !== "noshow").forEach((s) => {
    const a = s.checkIn > first ? s.checkIn : first, b = s.checkOut < next ? s.checkOut : next, n = nightsBetween(a, b);
    nights += n; revenue += n * (Number(s.rate) || 0);
  });
  const avail = rooms.length * days;
  return { nights, revenue, adr: nights ? revenue / nights : 0, revpar: avail ? revenue / avail : 0, occ: avail ? (nights / avail) * 100 : 0 };
}
