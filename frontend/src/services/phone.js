/* digits for wa.me links; a leading 0 is read as Syria (+963) — type international numbers for other countries */
export function waPhone(ph) {
  let d = String(ph || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "963" + d.slice(1);
  return d;
}
