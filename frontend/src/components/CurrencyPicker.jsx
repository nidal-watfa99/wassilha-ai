import React from "react";
import { useApp } from "../context/AppContext";

/* code: [ISO country, Arabic name, English name] — any other currency can be typed by hand. */
export const CURRENCIES = {
  SYP: ["SY", "ليرة سورية", "Syrian pound"], USD: ["US", "دولار أمريكي", "US dollar"], EUR: ["EU", "يورو", "Euro"], TRY: ["TR", "ليرة تركية", "Turkish lira"],
  SAR: ["SA", "ريال سعودي", "Saudi riyal"], AED: ["AE", "درهم إماراتي", "UAE dirham"], KWD: ["KW", "دينار كويتي", "Kuwaiti dinar"], QAR: ["QA", "ريال قطري", "Qatari riyal"],
  BHD: ["BH", "دينار بحريني", "Bahraini dinar"], OMR: ["OM", "ريال عماني", "Omani rial"], JOD: ["JO", "دينار أردني", "Jordanian dinar"], LBP: ["LB", "ليرة لبنانية", "Lebanese pound"],
  IQD: ["IQ", "دينار عراقي", "Iraqi dinar"], EGP: ["EG", "جنيه مصري", "Egyptian pound"], LYD: ["LY", "دينار ليبي", "Libyan dinar"], TND: ["TN", "دينار تونسي", "Tunisian dinar"],
  DZD: ["DZ", "دينار جزائري", "Algerian dinar"], MAD: ["MA", "درهم مغربي", "Moroccan dirham"], SDG: ["SD", "جنيه سوداني", "Sudanese pound"], YER: ["YE", "ريال يمني", "Yemeni rial"],
  GBP: ["GB", "جنيه إسترليني", "Pound sterling"], JPY: ["JP", "ين ياباني", "Japanese yen"], CNY: ["CN", "يوان صيني", "Chinese yuan"], INR: ["IN", "روبية هندية", "Indian rupee"],
  PKR: ["PK", "روبية باكستانية", "Pakistani rupee"], IRR: ["IR", "ريال إيراني", "Iranian rial"], RUB: ["RU", "روبل روسي", "Russian ruble"], CHF: ["CH", "فرنك سويسري", "Swiss franc"],
  CAD: ["CA", "دولار كندي", "Canadian dollar"], AUD: ["AU", "دولار أسترالي", "Australian dollar"], KRW: ["KR", "وون كوري", "South Korean won"], BRL: ["BR", "ريال برازيلي", "Brazilian real"],
  MXN: ["MX", "بيزو مكسيكي", "Mexican peso"], ZAR: ["ZA", "راند جنوب أفريقي", "South African rand"], SEK: ["SE", "كرونة سويدية", "Swedish krona"], NOK: ["NO", "كرونة نرويجية", "Norwegian krone"],
  DKK: ["DK", "كرونة دنماركية", "Danish krone"], PLN: ["PL", "زلوتي بولندي", "Polish zloty"], UAH: ["UA", "هريفنيا أوكرانية", "Ukrainian hryvnia"], IDR: ["ID", "روبية إندونيسية", "Indonesian rupiah"],
  MYR: ["MY", "رينغيت ماليزي", "Malaysian ringgit"], THB: ["TH", "بات تايلندي", "Thai baht"], SGD: ["SG", "دولار سنغافوري", "Singapore dollar"], HKD: ["HK", "دولار هونغ كونغ", "Hong Kong dollar"],
  NZD: ["NZ", "دولار نيوزيلندي", "New Zealand dollar"],
};
export const flag = (iso) => String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
const OTHER = "__other";

export default function CurrencyPicker({ value, onChange }) {
  const { t, locale } = useApp();
  const known = !!CURRENCIES[value];
  const [manual, setManual] = React.useState(!!value && !known);
  const sel = manual ? OTHER : known ? value : "";
  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      <select className="select" value={sel} onChange={(e) => { if (e.target.value === OTHER) { setManual(true); onChange(known ? "" : value); } else { setManual(false); onChange(e.target.value); } }}>
        {!sel && <option value="">—</option>}
        {Object.entries(CURRENCIES).map(([c, [iso, ar, en]]) => <option key={c} value={c}>{flag(iso)} {c} — {locale === "ar" ? ar : en}</option>)}
        <option value={OTHER}>✍ {t("cur_other")}</option>
      </select>
      {manual && <input className="input" required maxLength={6} dir="ltr" style={{ textAlign: "start" }} placeholder="XYZ" value={value} onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9$€£¥]/g, ""))} />}
    </div>
  );
}
