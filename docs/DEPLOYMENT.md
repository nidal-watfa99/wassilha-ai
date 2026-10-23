# النشر (DEPLOYMENT)

## 1. أصل واحد (موصى به)

الخادم يقدّم الواجهة المبنية — عملية واحدة، منفذ واحد، نفس الأصل للكوكيز وWebSocket (لا مشاكل CORS).

```bash
# ابنِ الواجهة
cd frontend
npm install
npm run build
rm -rf ../backend/static && cp -r dist ../backend/static

# شغّل الخادم
cd ../backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # ثم عدّل القيم

# بيئة الإنتاج
export WASSILHA_ENV=production
export JWT_SECRET="$(openssl rand -hex 32)"
export COOKIE_SECURE=true   # خلف HTTPS فقط
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
```

يرفض الخادم الإقلاع عمداً مع `WASSILHA_ENV=production` بدون `JWT_SECRET`.

ملاحظة: تقييد معدل الطلبات في الذاكرة — مناسب لنشر أحادي العملية (uvicorn واحد). عند التوسع لعدة عمليات/عقد استخدم قاعدة بيانات مشتركة أو حلاً مثل nginx rate limiting.

## 2. التطوير (أصلان)

`frontend/vite.config.js` يوجّه `/api` و`/ws` وكيلَين إلى `127.0.0.1:8000`.

- الخادم: `.venv/bin/uvicorn server:app --port 8000 --reload`
- الواجهة: `npm run dev` → http://localhost:5173

## 3. أندرويد / Termux

```bash
pkg update && pkg install python nodejs git unzip
unzip wassilha-ai.zip && cd wassilha-ai/backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && npm install && npm run build
rm -rf ../backend/static && cp -r dist ../backend/static
cd ../backend && .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
```

افتح `http://localhost:8000` من متصفح الهاتف. لجلسات طويلة نفّذ `termux-wake-lock` لمنع أندرويد من إيقاف العملية.

## 4. وكيل عكسي (nginx)

```nginx
server {
  listen 443 ssl;
  server_name wassilha.example.com;
  # ssl_certificate ...; ssl_certificate_key ...;
  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
  location /ws {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

مع HTTPS أمام الخادم اضبط `COOKIE_SECURE=true`.

## 5. وضع المعاينة المستضافة (PREVIEW_MODE)

لعرض التطبيق على منصة استضافة تعرضه داخل إطار معزول (sandboxed iframe) تُمنع فيه الكوكيز، يوفر الخادم وضع معاينة اختيارياً:

- فعّله بـ `PREVIEW_MODE=true` **فقط خلف وكيل استضافة موثوق** يحقن ترويسة `X-Visitor-Id` في كل طلب (HTTP وWebSocket).
- عند غياب كوكي جلسة صالح، يُعامل معرّف الزائر كجلسة: يُنشأ حساب مستقل لكل زائر مع بيانات تجريبية حقيقية (مهام، جهات اتصال، مستند، منتج).
- الواجهة تكتشف هذا الوضع تلقائياً عبر عنوان API المعاد كتابته وتُسقط الكوكيات من الطلبات (ترويسة الزائر تكفي).
- **لا تفعّله أبداً في الإنتاج**: الترويسة ليست موثوقة إلا خلف الوكيل الخاص.

## 6. متغيرات البيئة

انظر `backend/.env.example`. الأهم:

| المتغير | الغرض |
|--------|--------|
| `JWT_SECRET` | **إلزامي في الإنتاج** — مفتاح توقيع الرموز |
| `WASSILHA_ENV` | `production` يفعّل حارس السر |
| `DATABASE_URL` | الافتراضي: ملف SQLite محلي |
| `CORS_ORIGINS` | الأصول المسموحة (وضع التطوير) |
| `COOKIE_SECURE` | علم Secure للكوكي |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | مزود متوافق OpenAI |
| `STUN_URL` / `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | بنية WebRTC |
| `RATE_LIMIT_ENABLED` | للتعطيل في الاختبارات فقط |

## 7. البيانات والنسخ الاحتياطي

قاعدة SQLite في `backend/data/` (مستثناة من git والـ ZIP). انسخ المجلد كاملاً للنسخ الاحتياطي؛ الملفات المرفوعة تحت `backend/data/uploads/`. الاستعادة = إعادة نسخ المجلد.

## 8. التحديث

```bash
# افكّ الضغط فوق المجلد الحالي أو اسحب التحديث، ثم:
cd frontend && npm install && npm run build
rm -rf ../backend/static && cp -r dist ../backend/static
kill $(lsof -t -i:8000) && cd ../backend && .venv/bin/uvicorn server:app --port 8000
```
