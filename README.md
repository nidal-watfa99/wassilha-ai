# وسيلة AI — Wassilha AI

> **GitHub Pages:** the repository publishes automatically in a browser-only *local mode*
> (no server needed). See [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).

منصة أعمال متكاملة (Full-Stack) تجمع في تطبيق واحد: جهات الاتصال، المراسلة الفورية مع المكالمات الصوتية والمرئية (WebRTC)، المهام والتقويم، المستندات، المساعد الذكي، الإحصاءات، إدارة المنتجات والمدفوعات، والآلة الحاسبة التجارية.

الواجهة مبنية بـ **React 18 + Vite**، والخادم بـ **FastAPI (Python)**، مع قاعدة بيانات **SQLite** عبر SQLAlchemy، ومصادقة بجلسات **Cookie + JWT**، وحماية **CSRF**، وتقييد معدل الطلبات، واختبارات مؤتمتة.

---

## المتطلبات

- Python 3.11 أو أحدث
- Node.js 18 أو أحدث (لبناء الواجهة فقط)

## التشغيل السريع (نمط التطوير)

```bash
# 1) الخادم
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # عدّل القيم كما تشاء (اختياري في التطوير)
.venv/bin/uvicorn server:app --port 8000

# 2) الواجهة (نافذة أخرى)
cd frontend
npm install
npm run dev                    # http://localhost:5173 (وكيل /api و /ws إلى 8000)
```

## التشغيل بنمط الإنتاج (أصل واحد)

```bash
cd frontend && npm install && npm run build
rm -rf ../backend/static && cp -r dist ../backend/static
cd ../backend
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
# افتح http://IP:8000 — الخادم يقدّم الواجهة والـ API من نفس الأصل
```

> تنبيه أمني: في الإنتاج اضبط `WASSILHA_ENV=production` ومتغير `JWT_SECRET` (مثال: `openssl rand -hex 32`)، و`COOKIE_SECURE=true` خلف HTTPS. بدون `JWT_SECRET` في وضع الإنتاج سيرفض الخادم الإقلاع عمداً.

## التشغيل على هاتف أندرويد (Termux)

```bash
pkg update && pkg install python nodejs git unzip
unzip wassilha-ai.zip && cd wassilha-ai/backend

# 1) جهّز الخادم
python -m venv .venv && .venv/bin/pip install -r requirements.txt

# 2) ابنِ الواجهة (قبل تشغيل الخادم — الخادم يقدّمها من backend/static)
cd ../frontend && npm install && npm run build
rm -rf ../backend/static && cp -r dist ../backend/static

# 3) شغّل الخادم (من مجلد backend)
cd ../backend && .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
```

ثم افتح `http://localhost:8000` من متصفح الهاتف. لجلسات طويلة نفّذ `termux-wake-lock` لمنع أندرويد من إيقاف العملية.

## الاختبارات

```bash
cd backend
.venv/bin/python -m pytest tests/ -q -p no:cacheprovider
```

## هيكل المشروع

```
wassilha-ai/
├── README.md / QA_REPORT.md
├── docs/            # ARCHITECTURE / DEPLOYMENT / API / DESIGN_SYSTEM
├── backend/
│   ├── server.py    # تطبيق FastAPI: CORS، CSRF، تقديم الواجهة، الفحوص
│   ├── config.py    # الإعدادات عبر متغيرات البيئة
│   ├── models/      # SQLAlchemy: المستخدمون، المحادثات، المهام، الملفات...
│   ├── services/     # الأمان، الملفات، الذكاء الاصطناعي، الزمن الحقيقي
│   ├── routes/       # auth, contacts, tasks, messaging, ai, commerce, insights, meta, ws
│   ├── tests/       # pytest (32 اختباراً)
│   └── .env.example
└── frontend/
    ├── src/pages/   # 13 صفحة (دعم كامل للعربية RTL والإنجليزية والإسبانية)
    ├── src/context/ # الجلسة، الزمن الحقيقي (WebSocket)، المكالمات (WebRTC)
    ├── src/i18n/    # قواميس ar / en / es
    └── src/styles/design-system.css  # نظام التصميم المستخرج من الموقع المرجعي
```

## الميزات الرئيسية

- **الحسابات**: تسجيل/دخول/خروج مع Argon2 وJWT مع إبطال فعّال (RevokedToken)، وتغيير كلمة المرور والملف الشخصي.
- **جهات الاتصال**: CRUD كامل مع بحث وتفاصيل وسجل محادثات.
- **المراسلة**: محادثات فردية/جماعية، رسائل فورية عبر WebSocket مع حالة تسليم/قراءة، مرفقات ملفات مع تقدم رفع، رسائل صوتية (MediaRecorder)، ورسائل مؤقتة مع إعادة محاولة ذكية (client_key لمنع التكرار).
- **المكالمات**: صوتية ومرئية عبر WebRTC مع إشارات عبر WebSocket (تحقق من أطراف المكالمة)، وSTUN/TURN قابل للضبط.
- **المهام والتقويم**: مهام بأولويات وحالات ومواعيد، وأحداث شهرية.
- **المستندات**: محرر نصوص مع مؤشر تغييرات غير محفوظة، تحذير قبل المغادرة أو إعادة التحميل، وحفظ يدوي مع حالات واضحة.
- **المساعد الذكي**: محول متوافق مع OpenAI — إذا لم يُضبط مفتاح API يعرض حالة "غير مهيأ" بصراحة (بدون أي تزييف).
- **الإحصاءات**: لوحة مؤشرات ورسوم CSS خالصة من بيانات حقيقية.
- **التجارة**: منتجات ومدفوعات (تسجيل ومعالجة حالة — بلا دفع وهمي).
- **الآلة الحاسبة**: محلل تعبيرات رياضي آمن (Shunting-yard، بدون eval).
- **الأمان**: CSRF على كل الطفرات، تحقق من ملكية كل مورد، تحقق MIME + بصمة الملف، فحص أصل WebSocket، تقييد معدل الطلبات، وفحص سر الإنتاج.

## الوثائق التفصيلية

- `docs/ARCHITECTURE.md` — البنية والمكونات وتدفق البيانات
- `docs/API.md` — مرجع كامل لواجهات REST وWebSocket
- `docs/DEPLOYMENT.md` — النشر على VPS / Termux / Docker
- `docs/DESIGN_SYSTEM.md` — نظام التصميم المستخرج من الموقع المرجعي
- `QA_REPORT.md` — تقرير الجودة الكامل بالنتائج الفعلية

## حدود معروفة (صدقاً ودون تزييف)

1. تدفق استعادة كلمة المرور غير منفّذ (يتطلب خدمة بريد).
2. الوسائط عبر الشبكات المختلفة تحتاج TURN مُهيأ — لم يُختبر بين شبكتين حقيقيتين.
3. مزود الذكاء الاصطناعي يحتاج مفتاح API حقيقياً — الحالة غير المهيأة تظهر صراحة للمستخدم.
4. تسجيل الصوت والمكالمات الفعلية تحتاج أجهزة حقيقية بميكروفون/كاميرا.
