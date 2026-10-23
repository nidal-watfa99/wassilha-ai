# مرجع واجهة البرمجة (API)

العنوان الأساسي: `/api`. معظم النقاط تتطلب كوكي جلسة مصادَق عليه. **استثناءات عمومية**: `GET /api/health` و`GET /api/about` و`GET /api/ai/status` (فحص حالة فقط) متاحة دون مصادقة، و`/api/auth/register` و`/api/auth/login` و`/api/auth/logout` معفاة من ترويسة CSRF (وهي محمية بتقييد معدل الطلبات).

كل الطلبات التي تغيّر الحالة (POST/PATCH/PUT/DELETE) يجب أن تحمل الترويسة `X-Requested-With: XMLHttpRequest` (حماية CSRF) — الواجهة تضيفها تلقائياً.

الأخطاء: ‏JSON بصيغة `{"detail": "..."}` مع رموز حالة صحيحة (401، 403، 404، 409، 422، 429، 503).

## المصادقة

| الطريقة | المسار | الجسم | ملاحظات |
|--------|------|------|-------|
| POST | `/auth/register` | `{name, email, password}` | 201؛ بتقييد معدل؛ بدون ترويسة CSRF |
| POST | `/auth/login` | `{email, password}` | يضبط كوكي HttpOnly |
| POST | `/auth/logout` | — | يبطل الرمز في الخادم (قاعدة البيانات) |
| GET | `/auth/me` | — | الملف الحالي |
| PATCH | `/auth/me` | `{name?, email?}` | |
| PUT | `/auth/password` | `{current_password, new_password}` | |

## جهات الاتصال

| الطريقة | المسار | ملاحظات |
|--------|------|-------|
| GET | `/contacts` | قائمة (محدودة بالمالك) |
| POST | `/contacts` | `{name, email?, phone?, company?, notes?}` |
| GET | `/contacts/{id}` | |
| PATCH | `/contacts/{id}` | تحديث جزئي |
| DELETE | `/contacts/{id}` | |

## المراسلة

| الطريقة | المسار | ملاحظات |
|--------|------|-------|
| GET | `/conversations` | قائمة مع الأعضاء وآخر رسالة و`display_name` |
| POST | `/conversations` | `{emails: [...]}` — ينشئ أو يعيد استخدام |
| GET | `/conversations/{id}/messages` | سجل صفحات |
| POST | `/conversations/{id}/messages` | `{body?, client_key, file_id?}` — عزل تكرار (قيد فريد) |
| POST | `/conversations/{id}/read` | وسم كمقروء |
| POST | `/files/upload` | multipart؛ قائمة سماح + بصمة سحرية؛ تقدم عبر XHR |
| GET | `/files/{id}/download` | |
| GET | `/files/{id}/info` | |

## المهام والأحداث

| الطريقة | المسار | ملاحظات |
|--------|------|-------|
| GET/POST | `/tasks` | `{title, status?, priority?, due_date?}` |
| GET/PATCH/DELETE | `/tasks/{id}` | تحقق 422 من التواريخ غير الصالحة |
| GET/POST | `/events` | `{title, start_at, end_at?, color?}` |
| PATCH/DELETE | `/events/{id}` | |

## المستندات

GET/POST‏ `/documents` وGET/PATCH/DELETE‏ `/documents/{id}` — `{title, body}`.

## المساعد الذكي

| الطريقة | المسار | ملاحظات |
|--------|------|-------|
| GET | `/ai/status` | `{configured: bool}` |
| GET | `/ai/conversations` | قائمة المحادثات مع الرسائل |
| GET | `/ai/conversations/{id}` | |
| DELETE | `/ai/conversations/{id}` | |
| POST | `/ai/chat` | `{conversation_id?, message}` → ‏503‏ `ai_not_configured` بدون مفتاح مزود |

## التجارة

| الطريقة | المسار | ملاحظات |
|--------|------|-------|
| GET/POST | `/products` | `{name, price, ...}` |
| PATCH/DELETE | `/products/{id}` | |
| GET/POST | `/payments` | يسجّل قيد دفعة (لا معالجة دفع وهمية) |
| PATCH/DELETE | `/payments/{id}` | انتقالات الحالة |

## الإحصاءات والفحوص

- GET‏ `/dashboard` — أعداد حقيقية للمستخدم (أسماء عرض المحادثات المحسوبة من الأعضاء).
- GET‏ `/insights` — تجميعات (رسائل حسب يوم الأسبوع، مهام حسب الأولوية/الحالة).
- GET‏ `/health` — فحص حيوية عام (بدون مصادقة).
- GET‏ `/config/webrtc` — إعدادات STUN/TURN — **تتطلب مصادقة** (لا تسريب TURN لمجهول).
- GET‏ `/about` — معلومات البناء/الإصدار (بدون مصادقة).

## قناة WebSocket‏ `/ws`

- المصادقة: كوكي الجلسة (يُتحقق في الخادم)؛ الأصل مفحوص مقابل قائمة سماح.
- **من الخادم إلى العميل** (الأسماء الفعلية كما في الكود): `message` (رسالة جديدة مُقبولة من الخادم)، `incoming-call` (تحمل SDP العرض وبيانات المتصل — العرض الأصلي لا يُمرَّر بنوعه)، `call-answer` و`call-ice` (تُمرَّر كما هي إلى الطرف الآخر)، `call-end`، و`error`.
- **من العميل إلى الخادم**: `call-offer`، `call-answer`، `call-ice`، `call-end`.
  - `call-offer`: يتحقق الخادم أن الطرفين يشتركان في المحادثة ويسجّل المكالمة، ثم يرسل `incoming-call` (مع SDP) إلى الطرف الآخر.
  - `call-answer` / `call-ice`: يتحقق الخادم أن المرسل مشارك فعلي في المكالمة النشطة قبل التمرير.
  - `call-end`: يُرسل إلى الطرف الآخر؛ وتُغلق المكالمة النشطة تلقائياً بعد مهلة دقيقتين إن لم تكتمل.

## تقديم الواجهة في الإنتاج

عند وجود `backend/static/`:‏ `GET /` يقدّم الواجهة (index.html) وكل المسارات غير-`/api` ترجع إليها؛ `/api/*` تعيد JSON‏ 404.
