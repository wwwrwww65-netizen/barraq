# إعداد Firebase لنظام الترخيص — Mister Casher

## 1. ملفات تحتاجها من Firebase Console

1. أنشئ مشروعاً في [Firebase Console](https://console.firebase.google.com/).
2. فعّل **Cloud Firestore** (وضع Production مع قواعد أمان لاحقاً).
3. من **Project settings → Service accounts** → **Generate new private key**.
4. انسخ الملف المحمّل إلى:
   - `%AppData%\baraaq\firebase-service-account.json` (Windows)
   - أو `firebase-service-account.json` بجانب التطبيق (للتطوير)

> لا ترفع هذا الملف إلى Git. استخدم `firebase-service-account.example.json` كمرجع فقط.

## 2. مجموعات Firestore

### `Licenses`

مستند لكل مطعم (يُنشأ تلقائياً عند بدء التجربة):

| الحقل | النوع | الوصف |
|--------|--------|--------|
| `hubDeviceId` | string | DeviceID للجهاز الرئيسي |
| `status` | string | `trial` \| `active` \| `expired` \| `blocked` |
| `allowedClients` | number | عدد الأجهزة المسموحة على LAN |
| `restaurantName` | string | اسم المطعم |
| `adminUsername` | string | حساب المدير |
| `trialStartedAt` | timestamp | بداية التجربة |
| `trialEndsAt` | timestamp | نهاية التجربة |
| `linkedDevices` | array | `{ deviceId, ip, hostname, lastSeen, role }` |
| `updatedAt` | timestamp | آخر تحديث |

### `Activation_Requests`

طلبات التفعيل / الترقية:

| الحقل | النوع | الوصف |
|--------|--------|--------|
| `type` | string | `trial_start` \| `permanent_activate` \| `upgrade_request` |
| `deviceId` | string | جهاز مقدّم الطلب |
| `hubDeviceId` | string | الجهاز الرئيسي المرتبط |
| `clientDeviceId` | string | جهاز فرعي (للترقية) |
| `status` | string | `pending` \| `approved` \| `rejected` |
| `restaurantName` | string | من localStorage |
| `adminUsername` | string | |
| `restaurantSettings` | string | JSON إعدادات المطعم |
| `createdAt` | timestamp | |

## 3. تفعيل يدوي من الإدارة

1. افتح مستند `Licenses` للمطعم (ابحث بـ `hubDeviceId`).
2. غيّر `status` إلى `active`.
3. اضبط `allowedClients` (مثلاً 3 أو 5).
4. على جهاز المطعم: **الإعدادات → الترخيص → تحديث بيانات الترخيص يدوياً**.

## 4. Kill Switch

غيّر `status` إلى `blocked` أو `expired` في Firestore — خلال 5 دقائق (أو فور التحديث اليدوي) يُوقف HTTP ويُطرد الأجهزة الفرعية.

## 5. فهرسة Firestore (موصى بها)

- `Licenses`: فهرس مركّب على `hubDeviceId` (Ascending).
