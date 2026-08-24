أكيد. هذه النسخة الكاملة المحدثة من البرومبت، وفيها كل المتطلبات السابقة + نظام الإشعارات + تبويبات الطلبات الديناميكية لكل Request Type + الفلاتر الديناميكية حسب الحقول + فتح محادثة Telegram + 2FA باستخدام Google Authenticator + إدارة 2FA.

اعتمدت في صياغة البرومبت على Next.js 16.3 الحالي، وMongoDB Node.js Driver 7.5، مع Node.js 20.19+، وهي الإصدارات/المتطلبات المتاحة حالياً وفق المصادر الرسمية. 

> انسخ البرومبت من هنا كاملاً إلى Cursor Agent:




---

🚀 MASTER PROMPT — Telegram Dynamic Request Management Platform

أنت تعمل كـ Senior Full-Stack Engineer + Software Architect + UI/UX Engineer + Security Engineer + DevOps Engineer.

قم ببناء منصة Production-Ready كاملة لإدارة Telegram Bots والطلبات الديناميكية والمستخدمين والملفات والإشعارات والسجلات والمصادقة الثنائية.

لا أريد Prototype.

لا أريد Mock UI.

لا أريد Fake APIs.

أريد نظاماً حقيقياً قابلاً للتشغيل Production، وكل زر وكل Form وكل API وكل Telegram interaction يجب أن يعمل فعلياً.


---

1. TECHNOLOGY STACK

استخدم أحدث الإصدارات المستقرة والمتوافقة وقت التنفيذ.

الأساس:

Next.js 16.3 أو أحدث Stable compatible

React أحدث إصدار متوافق

TypeScript

Node.js 20.19+ LTS أو أحدث LTS متوافق

MongoDB

Official MongoDB Node.js Driver 7.5 أو أحدث Stable compatible

MongoDB GridFS

Telegram Bot API

Telegram Webhook

Tailwind CSS

shadcn/ui

Radix UI

Lucide Icons

Motion / Framer Motion

Zod

React Hook Form

TanStack Query عند الحاجة

Argon2id لكلمات المرور

TOTP 2FA متوافق مع Google Authenticator


استخدم MongoDB Official Node.js Driver بدلاً من Mongoose إلا إذا كان هناك سبب معماري قوي.

لا تستخدم Packages deprecated.

قبل تثبيت أي package، تحقق من أحدث Stable version المتوافق مع المشروع.


---

2. IMPORTANT — FIRST STEP

قبل كتابة الكود:

1. افحص المشروع الحالي.


2. افحص package.json.


3. افحص Architecture الحالية.


4. افحص Next.js version.


5. افحص Node version.


6. افحص Dependencies.


7. افحص MongoDB setup إن وجد.


8. افحص الملفات والمكونات الموجودة.


9. لا تحذف كوداً صالحاً بدون سبب.


10. إذا كان المشروع فارغاً، أنشئ Architecture كاملة.



بعد ذلك ابدأ التنفيذ.


---

3. PRODUCT

اسم المشروع مؤقتاً:

Telegram Request Management Platform

المنصة تسمح للإدارة بإنشاء Telegram Bots.

كل Bot يمكن أن يحتوي على عدة أنواع طلبات.

كل Request Type يحتوي على Dynamic Fields.

المستخدم يدخل إلى Telegram Bot.

يختار الطلب.

Bot يسأله عن البيانات حقلًا حقلًا.

يمكن أن يطلب:

Text

Email

Password

Number

Phone

Date

Select

Radio

Checkbox

File

Image

Payment proof

Instructions

Confirmation


بعد اكتمال الطلب:

يتم إنشاء Order برقم متسلسل.

Admin يرى الطلب.

Admin يستطيع تغيير الحالة.

Admin يستطيع إرسال رسالة.

Admin يستطيع إرفاق ملف.

User يستلم Notification.

يمكن ربط Request Type بمجموعة Telegram لإرسال إشعارات للإدارة.


---

4. UI / VISUAL IDENTITY

استخدم الرؤية البصرية السورية الجديدة كمصدر إلهام للهوية البصرية.

لا تنسخ شعارات أو هوية رسمية محمية.

أريد:

Syrian-inspired

Modern

Premium

Professional

Clean

Elegant

SaaS-like

Arabic-first

RTL


استخدم ألواناً مستوحاة بشكل حديث من الهوية السورية الجديدة.

لا تجعل التصميم يبدو كـ Admin Dashboard تقليدي.


---

5. DESIGN SYSTEM

استخدم Design Tokens:

--primary
--secondary
--accent
--background
--foreground
--muted
--border
--success
--warning
--danger
--info

لا تضع الألوان مباشرة داخل Components.

أنشئ Theme System.


---

6. TYPOGRAPHY

استخدم خط عربي احترافي مثل:

IBM Plex Sans Arabic

أو:

Noto Sans Arabic

Typography:

Display
H1
H2
H3
Body
Label
Caption


---

7. ANIMATIONS

استخدم Motion / Framer Motion.

Animations احترافية:

Page transitions

Sidebar

Drawer

Tabs

Dialogs

Cards

Table rows

Status changes

Toasts

File upload

Progress

Empty states

Success states

Request builder

Telegram preview

Notifications

Timeline


استخدم:

fade
slide
scale
spring
layout

لكن بدون مبالغة.

يجب دعم:

prefers-reduced-motion


---

8. RESPONSIVE

التطبيق Mobile First.

يجب أن يعمل بشكل ممتاز على:

360
375
390
414
430
768
1024
1280
1440
1920

Desktop:

Sidebar ثابت.

Mobile:

Sidebar → Drawer.

Tables:

Desktop → Table.

Mobile → Cards / Responsive table.

Dialogs:

Desktop → Dialog.

Mobile → Fullscreen / Bottom Sheet عند الحاجة.


---

9. ROLES

يوجد:

SUPER_ADMIN
ADMIN


---

10. SUPER ADMIN

Super Admin مخصص لإدارة الـ Admins.

Navigation:

المستخدمون
الإعدادات

Super Admin يستطيع:

إضافة Admin

تعديل Admin

تعطيل Admin

تفعيل Admin

حظر Admin

فك الحظر

تغيير Password

إنهاء Session

إنهاء جميع Sessions

مشاهدة Sessions

مشاهدة Activity

مشاهدة Logs


لا يحتاج Super Admin إلى واجهة إدارة الطلبات الخاصة بالـ Admin العادي إلا إذا قررنا إضافة ذلك لاحقاً.


---

11. ADMIN NAVIGATION

Admin العادي لديه:

Dashboard

البوتات

الطلبات

    طلب 1
       قيد الانتظار
       قيد المراجعة
       منجزة
       مرفوضة
       مؤرشفة

    طلب 2
       قيد الانتظار
       قيد المراجعة
       منجزة
       مرفوضة
       مؤرشفة

...

مجموعات Telegram

المستخدمون المحظورون

الإشعارات

السجلات

الإعدادات


---

12. IMPORTANT — DYNAMIC REQUEST TABS

هذه نقطة أساسية.

عند قيام Admin بإضافة Request Type جديد:

مثلاً:

طلب شراء حساب ChatGPT

يجب أن يظهر تلقائياً في Sidebar كـ Tab جديد:

طلبات

├── طلب شراء حساب ChatGPT
│
├── طلب خدمة VPN
│
├── طلب شراء VPS
│
└── ...

كل Request Type له صفحة مستقلة.

مثلاً:

/requests/chatgpt-account


---

13. REQUEST TAB SUBTABS

عند الضغط على:

طلب شراء حساب ChatGPT

تظهر Sub Tabs:

قيد الانتظار
قيد المراجعة
منجزة
مرفوضة
مؤرشفة

كل Subtab يعرض جدول Orders الخاصة بهذا Request Type والحالة الحالية.

مثلاً:

طلب شراء حساب ChatGPT

[قيد الانتظار 12]
[قيد المراجعة 4]
[منجزة 120]
[مرفوضة 8]
[مؤرشفة 40]

الأرقام يجب أن تكون حقيقية من MongoDB.


---

14. DYNAMIC ORDER TABLE

جدول الطلبات يجب أن يحتوي على أعمدة أساسية:

رقم الطلب
المستخدم
Telegram Username
Telegram Name
Telegram ID
وقت الطلب
الحالة

بالإضافة إلى Dynamic Columns بناءً على Fields الخاصة بالـ Request.

مثلاً إذا Request يحتوي:

Email
Password
Payment Proof

يمكن أن يظهر:

رقم الطلب
المستخدم
الإيميل
إثبات الدفع
الوقت
الحالة
الإجراءات

لكن:

Password لا تعرض بشكل عادي في الجدول.

تعامل معها كـ Sensitive.


---

15. DYNAMIC COLUMNS

إذا قام Admin بتعديل Request Fields:

مثلاً أضاف:

Country
Payment Method
Phone

يجب أن تتغير أعمدة جدول الطلبات تلقائياً.

لا تكتب أسماء الأعمدة بشكل Hard-coded.

استخرجها من:

requestType.fields


---

16. DYNAMIC FILTER SYSTEM

هذه ميزة أساسية.

لكل Request Type، يجب أن يتم بناء Filter UI تلقائياً بناءً على Fields.

مثلاً:

Request:

طلب شراء حساب

Fields:

Email
Country
Payment Method
Age
Date

عند فتح Filters:

اختر العمود

ثم:

اختر المعامل

ثم:

اختر القيمة


---

17. FILTER OPERATORS

حسب نوع الحقل.

Text

يساوي
لا يساوي
يحتوي
لا يحتوي
يبدأ بـ
ينتهي بـ

Number

يساوي
أكبر من
أصغر من
أكبر أو يساوي
أصغر أو يساوي
بين

Select

يساوي
لا يساوي

Date

يساوي
قبل
بعد
بين

Boolean

نعم
لا


---

18. MULTIPLE FILTERS

يمكن إضافة أكثر من Filter:

Country = Syria

AND

Payment Method = Bank

AND

Age > 18

أو مستقبلاً:

AND / OR

صمم architecture تسمح بذلك.


---

19. FILTER UI

مثال:

الفلاتر

[العمود]
Email

[المعامل]
يحتوي

[القيمة]
@gmail.com

[إضافة فلتر]

ثم:

Email يحتوي @gmail.com

Country = Syria

[مسح الكل]
[تطبيق]


---

20. SERVER-SIDE FILTERING

لا تجلب جميع Orders إلى Browser ثم قم بالفلترة بواسطة JavaScript.

الفلاتر يجب أن تتحول إلى MongoDB query آمنة.

ممنوع تمرير MongoDB operators مباشرة من User.

استخدم Zod parser وWhitelist للـ operators.


---

21. FILTER SECURITY

لا تسمح للمستخدم بإرسال:

$where
$regex
$expr

بشكل مباشر.

ابنِ Query Builder آمن.


---

22. TABLE ACTIONS

كل Order:

فتح
تغيير الحالة
إرسال رسالة
عرض المستخدم
فتح Telegram


---

23. OPEN TELEGRAM CHAT

أضف زر:

فتح محادثة Telegram

داخل Order.

إذا كان Username متاحاً:

استخدم Telegram deep link مناسب.

مثلاً:

https://t.me/username

ويمكن أن يكون:

tg://resolve?domain=username

إذا لم يكن Username متاحاً، لا تخترع رابطاً.

اعرض Telegram ID فقط، مع توضيح أن Telegram Bot API لا يتيح دائماً إنشاء رابط مباشر إلى مستخدم مجهول باستخدام ID فقط.

Telegram يدعم Deep Links وt.me/<username> رسمياً. 


---

24. USER INFORMATION

داخل Order Details:

معلومات المستخدم

Telegram Username
Telegram First Name
Telegram Last Name
Telegram ID
Phone Number إن كان متاحاً
Language
First Seen
Last Seen

مع:

[فتح محادثة Telegram]
[حظر من هذا الطلب]


---

25. NOTIFICATIONS SYSTEM

أضف نظام Notifications كامل داخل Dashboard.

Collection:

notifications

Fields:

_id
recipientUserId
type
title
message
entityType
entityId
orderId
requestTypeId
botId
read
readAt
createdAt


---

26. NOTIFICATIONS TAB

أضف Sidebar Tab:

🔔 الإشعارات

مثلاً:

🔔 الإشعارات 5

الرقم يمثل:

Unread Notifications


---

27. NOTIFICATION BADGE

إذا يوجد:

5

يظهر:

🔔 الإشعارات
       5

إذا:

0

لا يظهر Badge أو يظهر بشكل مناسب.


---

28. NOTIFICATION TYPES

مثلاً:

NEW_ORDER
ORDER_STATUS_CHANGED
ORDER_MESSAGE
FILE_RECEIVED
BOT_ERROR
BOT_STARTED
BOT_STOPPED
SYSTEM
SECURITY


---

29. NEW ORDER NOTIFICATION

عند قيام Telegram User بإرسال طلب جديد:

يتم إنشاء Notification للـ Admin.

مثلاً:

🆕 طلب جديد

تم استلام طلب جديد:

#ORD-00001

طلب شراء حساب ChatGPT

المستخدم:
@ahmad


---

30. CLICK NOTIFICATION

عند الضغط على Notification:

1. يتم Mark as Read.


2. يتم الانتقال مباشرة إلى Order.



مثلاً:

/requests/chatgpt-account?order=ORD-00001

أو:

/orders/...

بحسب Architecture.

لكن يجب أن يفتح المستخدم الطلب مباشرة.


---

31. MARK AS READ

عند فتح Notification:

read = true
readAt = now


---

32. MARK ALL AS READ

في صفحة Notifications:

تحديد الكل كمقروء

يقوم بتحديث Notifications الخاصة بالـ Admin الحالي فقط.


---

33. NOTIFICATION DROPDOWN

بالإضافة إلى صفحة:

/notifications

أضف Bell Dropdown في Header.

مثلاً:

🔔

آخر الإشعارات:

🆕 طلب جديد
#ORD-00001
منذ دقيقة

🔄 تحديث طلب
#ORD-00002
منذ 5 دقائق

[عرض كل الإشعارات]


---

34. REAL-TIME NOTIFICATIONS

صمم النظام بحيث يمكن استقبال Notifications بشكل شبه فوري.

يفضل استخدام:

MongoDB Change Streams

أو WebSocket/SSE مناسب.

Architecture يجب أن تسمح بالتوسع لاحقاً.

لا تعتمد على refresh يدوي فقط.


---

35. NOTIFICATION COUNTER

يجب أن يكون:

Unread count

Server-authoritative.

لا تعتمد على localStorage.


---

36. NOTIFICATION PERMISSION

Notification يجب أن تصل فقط إلى Admin الذي لديه صلاحية الوصول إلى:

Bot

Request

Order


لا ترسل Notification إلى Admin ليس لديه صلاحية.


---

37. NEW ORDER FLOW

عند Submit من Telegram:

Telegram User
↓
Validate
↓
Create Order
↓
Create Order History
↓
Create Admin Notification
↓
Send Group Notification
↓
Send Telegram Confirmation

إذا فشل Group Notification لا تفشل عملية Order.


---

38. REQUEST TYPE CREATION

Admin ينشئ:

طلب شراء حساب ChatGPT

بعد Save:

Sidebar يتحدث تلقائياً:

طلبات

طلب شراء حساب ChatGPT

لا يحتاج Restart.


---

39. REQUEST BUILDER

Request Builder:

Fields
Builder
Telegram Preview

Desktop:

------------------------------------------------
| Fields | Builder              | Preview      |
------------------------------------------------

Mobile:

Fields
Builder
Preview


---

40. DYNAMIC FIELD TYPES

TEXT
EMAIL
PASSWORD
NUMBER
PHONE
URL
DATE
DATETIME
SELECT
RADIO
CHECKBOX
TEXTAREA
FILE
IMAGE
INSTRUCTION
CONFIRMATION


---

41. FIELD CONFIGURATION

كل Field:

id
name
label
type
placeholder
description
telegramMessage
required
sensitive
validation
options
order
active
imageFileId
attachmentFileId


---

42. TELEGRAM FIELD MESSAGE

كل Field يستطيع تخصيص:

Telegram Message

مثلاً:

📧 يرجى إرسال البريد الإلكتروني الشخصي

ويمكن إرفاق:

صورة

File

Caption



---

43. REQUEST EXAMPLE

أنشئ Seed:

طلب شراء حساب ChatGPT

Fields:

Email

EMAIL

Password

PASSWORD
sensitive = true

Payment Instructions

INSTRUCTION

Message:

💵 يرجى إرسال مبلغ 20 دولار إلى الحساب التالي.

مع QR Image.

Payment Proof

FILE


---

44. SENSITIVE DATA

Sensitive:

Password
Tokens
Secrets

يجب:

Mask في Dashboard

عدم إرسالها إلى Groups

عدم إرسالها إلى Notifications

عدم تسجيلها في Logs

عدم ظهورها في Error Messages


صمم architecture تسمح بتشفير Sensitive Values في MongoDB.


---

45. ORDERS

Collection:

orders

Fields:

_id
orderNumber
botId
requestTypeId
telegramUserId
chatId
status
fields
attachments
createdAt
updatedAt
submittedAt
archivedAt
lastUpdatedBy


---

46. ORDER NUMBER

استخدم:

ORD-00001
ORD-00002
ORD-00003

Collection:

orderCounters

Atomic $inc.

لا تستخدم:

countDocuments()

لإنشاء الرقم.


---

47. STATUS

PENDING
REVIEWING
COMPLETED
REJECTED
ARCHIVED

العرض:

قيد الانتظار
قيد المراجعة
منجزة
مرفوضة
مؤرشفة


---

48. STATUS TABS

لكل Request Type:

قيد الانتظار
قيد المراجعة
منجزة
مرفوضة
مؤرشفة

كل Tab يعرض العدد.


---

49. ORDER STATUS TRANSITIONS

لا تسمح بانتقالات عشوائية.

أنشئ:

OrderStatusService

Transitions:

PENDING → REVIEWING
PENDING → REJECTED
PENDING → ARCHIVED

REVIEWING → COMPLETED
REVIEWING → REJECTED
REVIEWING → ARCHIVED

COMPLETED → ARCHIVED
REJECTED → ARCHIVED

يمكن توسيعها لاحقاً.


---

50. ARCHIVED

إذا:

status = ARCHIVED

لا ترسل Notification للمستخدم بسبب الأرشفة.

لكن:

Audit Log

Status History

Admin Notification إن كانت مناسبة


يجب تسجيل العملية.


---

51. ORDER STATUS HISTORY

Collection:

orderStatusHistory

Fields:

orderId
previousStatus
newStatus
changedBy
message
createdAt


---

52. ORDER DETAILS

اعرض:

Order Number
User
Request
Status
Created
Updated
Fields
Attachments
Timeline
Activity


---

53. ADMIN ORDER UPDATE

Dialog:

تحديث الطلب

Fields:

الحالة
الرسالة
المرفق


---

54. USER NOTIFICATION

مثلاً:

🔔 تحديث على طلبك

رقم الطلب:
#ORD-00001

الطلب:
طلب شراء حساب ChatGPT

الحالة:
🟡 قيد المراجعة

الرسالة:
تمت مراجعة طلبك.

إذا يوجد File:

📎 عرض المرفق


---

55. TELEGRAM GROUPS

Tab:

مجموعات Telegram

Collection:

telegramGroups

Fields:

_id
telegramGroupId
name
username
botId
requestTypeIds
active
createdAt
updatedAt


---

56. GROUP NOTIFICATIONS

عند إنشاء Order:

🆕 طلب جديد

#ORD-00001

الطلب:
طلب شراء حساب ChatGPT

المستخدم:
@ahmad

Telegram ID:
123456789

الحالة:
قيد الانتظار

لا ترسل Sensitive fields.


---

57. GROUP STATUS UPDATE

🔄 تحديث طلب

#ORD-00001

من:
قيد الانتظار

إلى:
قيد المراجعة

تم بواسطة:
Ahmed


---

58. TELEGRAM USERS

Collection:

telegramUsers

Fields:

_id
telegramUserId
username
firstName
lastName
languageCode
isPremium
phoneNumber
firstSeenAt
lastSeenAt

Phone Number قد لا يكون متاحاً.


---

59. BLOCKED USERS

Admin يستطيع حظر User من Request معين.

ليس Global Ban.

مثلاً:

@ahmad

محظور من:
طلب شراء حساب ChatGPT

لكن يستطيع استخدام Request آخر.


---

60. BLOCK COLLECTION

telegramUserBlocks

Fields:

_id
telegramUserId
username
firstName
lastName
phoneNumber
botId
requestTypeId
reason
blockedBy
blockedAt
unblockedBy
unblockedAt
active


---

61. BLOCKED USERS TAB

🚫 المستخدمون المحظورون

Table:

Username
Name
Telegram ID
Phone
Request
Reason
Blocked By
Blocked At
Status
Actions

Actions:

عرض
إلغاء الحظر
فتح الطلب
فتح Telegram


---

62. BLOCK FLOW

من Order:

🚫 حظر المستخدم من هذا الطلب

Dialog:

المستخدم:
@ahmad

الطلب:
طلب شراء ChatGPT

السبب:
[................]

[إلغاء]
[حظر]


---

63. UNBLOCK

هل تريد إلغاء حظر المستخدم؟

[إلغاء]
[إلغاء الحظر]

لا تحذف السجل.

اجعل:

active = false


---

64. TELEGRAM CONVERSATION

Collection:

telegramConversations

Fields:

botId
telegramUserId
chatId
state
orderId
currentFieldId
updatedAt
expiresAt

States:

IDLE
SELECTING_REQUEST
CREATING_ORDER
WAITING_FOR_FIELD
WAITING_FOR_FILE
REVIEW
SUBMITTED
CANCELLED

يجب ألا تضيع Conversation State عند Restart.


---

65. TELEGRAM FLOW

/start
↓
الطلبات
↓
اختيار Request
↓
Check Block
↓
Create Draft
↓
Field 1
↓
Field 2
↓
...
↓
Review
↓
Confirm
↓
Submit
↓
Generate Order Number
↓
Notify Admin
↓
Notify Group
↓
Confirm User


---

66. MY ORDERS

Telegram Command:

/طلبات

أو Button:

📋 طلباتي

اعرض Orders الخاصة بالمستخدم.


---

67. TELEGRAM START MENU

أهلاً بك 👋

اختر الخدمة:

Buttons:

🛒 الطلبات
📋 طلباتي
ℹ️ المساعدة


---

68. FILE STORAGE

MongoDB GridFS.

Bucket:

appFiles

لا تستخدم Base64.

لا تخزن Binary files داخل Order documents.

Streaming.


---

69. GRIDFS METADATA

ownerType
ownerId
uploadedBy
mimeType
size
originalName
purpose
createdAt

Purposes:

REQUEST_IMAGE
PAYMENT_PROOF
ORDER_ATTACHMENT
ADMIN_ATTACHMENT
BOT_MEDIA


---

70. FILE SECURITY

Validate:

MIME

Extension

Size

Ownership

Authorization


لا تثق في filename.

لا تسمح Path Traversal.


---

71. AUTHENTICATION

Authentication كامل:

Login
Logout
Password Change
Session Management
2FA

Passwords:

Argon2id


---

72. TWO-FACTOR AUTHENTICATION

أضف TOTP 2FA متوافقاً مع:

Google Authenticator

استخدم مكتبة موثوقة ومتوافقة مع RFC 6238.

لا تبنِ خوارزمية TOTP بنفسك.


---

73. 2FA OPTIONAL

2FA ليس إلزامياً في البداية.

Admin يستطيع تفعيله من:

الإعدادات
↓
الأمان
↓
التحقق بخطوتين


---

74. 2FA SETUP

عند:

تفعيل التحقق بخطوتين

اعرض:

التحقق بخطوتين

امسح رمز QR باستخدام
Google Authenticator

[QR CODE]

Secret Key:
••••••••••••

رمز التحقق:
[______]

[تفعيل]
[إلغاء]

لا تظهر Secret إلا في مرحلة Setup وبشكل آمن.


---

75. GOOGLE AUTHENTICATOR

المستخدم يستخدم:

Google Authenticator

لمسح QR.

بعد المسح يظهر:

6 digit code

يدخله في التطبيق.

لا تعتبر 2FA مفعلة قبل التحقق من TOTP فعلياً.


---

76. BACKUP CODES

عند تفعيل 2FA:

أنشئ Backup Recovery Codes.

مثلاً:

XXXX-XXXX
XXXX-XXXX
XXXX-XXXX
...

اعرضها مرة واحدة.

خزنها Hashed.

لا تخزنها Plain Text.

أضف:

تحميل
نسخ
طباعة


---

77. LOGIN WITHOUT 2FA

إذا Admin لا يملك 2FA:

Username
Password

[تسجيل الدخول]

بعد Login:

لا تجبره على 2FA.

لكن يمكن أن تعرض:

ننصح بتفعيل التحقق بخطوتين لحماية حسابك.

[تفعيل الآن]
[تخطي]


---

78. LOGIN WITH 2FA NOT YET SETUP

إذا كان المستخدم لم يضف 2FA:

عند تسجيل الدخول يمكن أن يظهر:

حماية حسابك

لم تقم بإضافة التحقق بخطوتين.

يمكنك الآن إعداد Google Authenticator.

[إعداد الآن]
[تخطي]

إذا اختار Skip:

يدخل Dashboard.

إذا اختار Setup:

اعرض QR.


---

79. IMPORTANT — DO NOT FORCE 2FA

2FA optional.

لكن إذا كان Super Admin مستقبلاً يريد Policy:

صمم architecture تسمح بإضافة:

REQUIRE_2FA_FOR_ADMINS

لاحقاً.


---

80. LOGIN WITH 2FA ENABLED

إذا:

2FA enabled

بعد Password الصحيح:

أدخل رمز التحقق

[______]

Google Authenticator

[تحقق]

إذا صحيح:

Login.

إذا خطأ:

رمز التحقق غير صحيح.


---

81. 2FA SECURITY

أضف:

Rate limiting

Replay protection

Time window صغير

Secure secret storage

Backup codes

Audit logs


لا تسجل:

TOTP Secret
TOTP Code
Backup Codes

في Logs.


---

82. 2FA DATABASE

داخل User:

twoFactorEnabled
twoFactorSecretEncrypted
twoFactorConfirmedAt
twoFactorLastUsedAt

Recovery Codes Collection:

twoFactorRecoveryCodes

Fields:

userId
codeHash
usedAt
createdAt


---

83. ENCRYPTION

TOTP Secret حساس.

لا تخزنه Plain Text.

استخدم encryption at rest.

مثلاً:

AES-256-GCM

أو نظام encryption موثوق.

Key في Environment / Secret Manager.

لا تخزن Encryption Key داخل MongoDB.


---

84. CHANGE 2FA

من Settings:

الأمان
↓
التحقق بخطوتين

إذا كان Enabled:

التحقق بخطوتين مفعّل

[إظهار QR / إعادة الإعداد]
[تغيير]
[إزالة التحقق بخطوتين]


---

85. REMOVE 2FA

لا تسمح بإزالة 2FA مباشرة.

اطلب:

كلمة المرور
+
رمز Google Authenticator الحالي

مثلاً:

إزالة التحقق بخطوتين

كلمة المرور:
[********]

رمز التحقق الحالي:
[______]

[إلغاء]
[إزالة]

إذا صحيح:

twoFactorEnabled = false

ويتم:

حذف / إبطال Secret

إبطال Recovery Codes

إنشاء Audit Log

إنهاء Sessions الحساسة إذا كانت السياسة تتطلب ذلك



---

86. CHANGE 2FA

لتغيير Google Authenticator:

Password
+
Current TOTP

ثم:

Generate new Secret
↓
QR
↓
Confirm new TOTP
↓
Replace old Secret
↓
Generate new Recovery Codes

لا تسمح باستبدال Secret بدون إثبات امتلاك العامل الحالي، إلا عبر Recovery / Account Recovery flow مصمم بشكل آمن.


---

87. SHOW QR

إذا طلب Admin:

رؤية الباركود

لا تعرض QR القديم بشكل دائم إذا كان ذلك يعرّض Secret للخطر.

الأفضل:

إظهار QR الحالي

بعد:

Password
+
Current TOTP

ويمكن إظهار QR مرة واحدة داخل Dialog آمن.


---

88. IMPORTANT 2FA UX

لا تستخدم كلمة:

OTP

فقط.

استخدم:

التحقق بخطوتين
Google Authenticator
رمز التحقق

للمستخدم العربي.


---

89. SESSIONS

Collection:

sessions

Fields:

_id
userId
tokenHash
ipAddress
userAgent
device
createdAt
lastActiveAt
expiresAt
revokedAt

لا تخزن Raw Session Token.


---

90. ADMIN SETTINGS

Settings:

الحساب
الأمان
الجلسات
الإشعارات

Security:

تغيير كلمة المرور
التحقق بخطوتين
Recovery Codes


---

91. NOTIFICATION SETTINGS

Admin يستطيع اختيار:

إشعار عند طلب جديد
إشعار عند تغيير الحالة
إشعار عند رسالة جديدة
إشعار عند فشل Bot

لكن Notification الخاصة بالأحداث الحرجة يمكن جعلها إلزامية.


---

92. AUDIT LOGS

Collection:

auditLogs

Fields:

_id
actorUserId
actorRole
action
category
entityType
entityId
botId
requestTypeId
orderId
telegramUserId
metadata
ipAddress
userAgent
createdAt


---

93. LOG CATEGORIES

AUTH
SECURITY
USER
BOT
REQUEST
ORDER
TELEGRAM
TELEGRAM_GROUP
BLOCK
FILE
NOTIFICATION
SETTINGS
SYSTEM


---

94. LOG ACTIONS

AUTH:

LOGIN
LOGIN_FAILED
LOGOUT
PASSWORD_CHANGED
SESSION_CREATED
SESSION_REVOKED

SECURITY:

2FA_ENABLED
2FA_DISABLED
2FA_SETUP_STARTED
2FA_SETUP_FAILED
2FA_VERIFICATION_FAILED
2FA_SECRET_CHANGED
RECOVERY_CODE_USED

ORDER:

ORDER_CREATED
ORDER_UPDATED
ORDER_STATUS_CHANGED
ORDER_ARCHIVED
ORDER_MESSAGE_SENT
ORDER_ATTACHMENT_ADDED

NOTIFICATION:

NOTIFICATION_CREATED
NOTIFICATION_READ
NOTIFICATION_READ_ALL
NOTIFICATION_SENT
NOTIFICATION_FAILED

BLOCK:

TELEGRAM_USER_BLOCKED
TELEGRAM_USER_UNBLOCKED


---

95. AUDIT LOG IMMUTABILITY

Audit Logs:

Append only

لا Edit

لا Delete من UI

لا تسمح بتعديلها بواسطة Admin



---

96. GLOBAL LOGS

أضف:

السجلات

Filters:

Admin
Category
Action
Bot
Request
Order
Telegram User
Date


---

97. ENTITY ACTIVITY

داخل:

Bot

Request

Order

Group

Blocked User

Admin


أضف:

Activity

Timeline.


---

98. BOT LOGS

لكل Bot:

Webhook received
Message received
Order created
Notification sent
Notification failed
Error
Started
Stopped


---

99. REQUEST LOGS

REQUEST_CREATED
REQUEST_UPDATED
REQUEST_ACTIVATED
REQUEST_DEACTIVATED
FIELD_CREATED
FIELD_UPDATED
FIELD_DELETED
FIELD_REORDERED


---

100. ORDER LOGS

Created
Status Changed
Message Sent
Attachment Added
Archived


---

101. SECURITY

احم النظام من:

XSS
CSRF
NoSQL Injection
IDOR
Broken Access Control
Session Hijacking
Brute Force
File Upload Attacks
Path Traversal
SSRF
Privilege Escalation
Telegram Webhook Spoofing

كل Input:

Zod


---

102. AUTHORIZATION

لا تعتمد على Frontend.

كل API:

Authentication
↓
Authorization
↓
Resource Ownership / Membership
↓
Operation


---

103. TELEGRAM WEBHOOK

Endpoint:

/api/telegram/webhook/[botId]

استخدم Telegram webhook secret.

تحقق من Update.

لا تسجل Bot Token.


---

104. TELEGRAM DUPLICATE UPDATES

احفظ Telegram Update ID.

يجب ألا يؤدي duplicate webhook إلى:

Order duplicate

Notification duplicate

Message duplicate

Status duplicate



---

105. OUTBOX

أنشئ Notification Outbox إذا كان مناسباً:

notificationOutbox

Statuses:

PENDING
SENT
FAILED

مع Retry.


---

106. FILE STORAGE

استخدم:

GridFS

Service:

FileStorageService
GridFSStorageService
FileAuthorizationService

Interface:

StorageProvider

بحيث يمكن مستقبلاً دعم:

S3
MinIO
R2
Azure Blob


---

107. API ARCHITECTURE

Services:

AuthService
UserService
SessionService
TwoFactorService

BotService
TelegramService
TelegramConversationService
TelegramNotificationService

RequestTypeService
RequestFieldService

OrderService
OrderStatusService

BlockedUserService

GroupService

FileStorageService

NotificationService

AuditService

لا تضع Business Logic داخل React Components.


---

108. API ROUTES

/api/auth/login
/api/auth/logout
/api/auth/change-password
/api/auth/sessions

/api/auth/2fa/setup
/api/auth/2fa/verify
/api/auth/2fa/disable
/api/auth/2fa/change
/api/auth/2fa/recovery-codes

/api/admin/users
/api/admin/users/[id]
/api/admin/users/[id]/sessions

/api/bots
/api/bots/[id]
/api/bots/[id]/start
/api/bots/[id]/stop
/api/bots/[id]/restart
/api/bots/[id]/logs

/api/request-types
/api/request-types/[id]
/api/request-types/[id]/fields

/api/orders
/api/orders/[id]
/api/orders/[id]/status
/api/orders/[id]/attachments
/api/orders/[id]/logs

/api/blocked-users
/api/blocked-users/[id]
/api/blocked-users/[id]/unblock

/api/notifications
/api/notifications/[id]/read
/api/notifications/read-all

/api/telegram/groups
/api/telegram/groups/[id]
/api/telegram/webhook/[botId]

/api/files/[id]

/api/audit-logs

/api/health
/api/ready


---

109. MONGODB COLLECTIONS

استخدم:

users
sessions

bots

requestTypes

orders
orderCounters
orderStatusHistory

telegramUsers
telegramConversations
telegramGroups
telegramUserBlocks

notifications
notificationOutbox

auditLogs

twoFactorRecoveryCodes

GridFS:

appFiles.files
appFiles.chunks


---

110. DATABASE INDEXES

أنشئ Indexes:

users.username
users.status

sessions.userId
sessions.tokenHash

bots.telegramBotId
bots.username

orders.orderNumber
orders.userId
orders.telegramUserId
orders.botId
orders.requestTypeId
orders.status
orders.createdAt

telegramUsers.telegramUserId

telegramConversations.telegramUserId
telegramConversations.botId

telegramUserBlocks.telegramUserId
telegramUserBlocks.requestTypeId
telegramUserBlocks.active

notifications.recipientUserId
notifications.read
notifications.createdAt

auditLogs.actorUserId
auditLogs.category
auditLogs.action
auditLogs.createdAt


---

111. BLOCK UNIQUE INDEX

لا تسمح بأكثر من Block فعال لنفس:

telegramUserId
+
requestTypeId

استخدم MongoDB Partial Unique Index.


---

112. NOTIFICATION INDEX

استخدم index مناسب:

recipientUserId
read
createdAt

حتى يكون:

Unread Count

سريعاً.


---

113. ORDER FILTER QUERY

أنشئ:

OrderFilterBuilder

Input:

{
  "field": "country",
  "operator": "equals",
  "value": "Syria"
}

يتم تحويله إلى MongoDB query آمنة.


---

114. ORDER TABLE SORTING

يمكن ترتيب:

Created At
Updated At
Order Number
Status

والـ Dynamic Fields عند الحاجة.

Sorting يجب أن يكون Server-side.


---

115. PAGINATION

Server-side.

استخدم Cursor Pagination حيث تكون مناسبة.

لا تجلب جميع الطلبات.


---

116. SEARCH

في Request Table:

Order Number
Username
Telegram ID
Name

مع Dynamic Fields عند الحاجة.


---

117. ADMIN DASHBOARD

Cards:

طلبات اليوم
قيد الانتظار
قيد المراجعة
منجزة
مرفوضة
مؤرشفة
البوتات
الإشعارات غير المقروءة

Charts:

Orders over time
Orders by status
Orders by Request


---

118. DYNAMIC SIDEBAR

Sidebar يجب أن يتحدث تلقائياً عندما:

يتم إنشاء Request

يتم حذف Request

يتم تعطيل Request

يتم تغيير Request name


لا تحتاج Refresh كامل.


---

119. REQUEST DELETE

لا تحذف Request Type فعلياً إذا كان لديه Orders.

استخدم Soft Delete / Archived state.

الطلبات القديمة تبقى قابلة للعرض.


---

120. BOT MANAGEMENT

Bot Card:

Name
@username
Telegram ID
Status
Webhook
Last Activity

Actions:

تشغيل
إيقاف
إعادة تشغيل
الإعدادات
Logs


---

121. BOT TOKEN SECURITY

Bot Token:

Encrypted

Never returned by API

Never displayed بعد الحفظ

Never logged

Never sent to Client



---

122. AUTHENTICATION SESSION SECURITY

استخدم Secure HTTP-only cookies.

خصائص مناسبة:

HttpOnly
Secure
SameSite

لا تخزن Authentication token في localStorage.


---

123. PASSWORD CHANGE

لتغيير Password:

Current Password
New Password
Confirm Password

بعد التغيير:

Audit Log

يمكن Revocation لجميع Sessions الأخرى حسب Security Policy



---

124. 2FA + PASSWORD CHANGE

إذا تم تغيير Password:

لا تقم تلقائياً بإزالة 2FA.

لكن:

Audit Log

يمكن إنهاء Sessions الأخرى



---

125. ADMIN SESSION UI

Admin يرى:

الجهاز
المتصفح
IP
آخر نشاط
تاريخ الإنشاء

Buttons:

إنهاء
إنهاء جميع الجلسات الأخرى


---

126. SUPER ADMIN SESSION CONTROL

Super Admin يستطيع:

عرض Sessions
إنهاء Session
إنهاء جميع Sessions


---

127. NOTIFICATION RETENTION

صمم إمكانية حذف / أرشفة Notifications القديمة تلقائياً مستقبلاً.

لا تجعل النظام يعتمد على عدد غير محدود من Notifications في Query واحدة.


---

128. NOTIFICATION PAGE

Route:

/notifications

واجهة:

الإشعارات

[غير مقروءة]
[الكل]

[تحديد الكل كمقروء]

كل Notification:

Icon
Title
Message
Order
Time
Unread Indicator

Click:

Mark Read
Navigate


---

129. NEW ORDER NOTIFICATION EXAMPLE

🆕 طلب جديد

تم استلام طلب جديد من Telegram.

#ORD-00042

طلب شراء حساب ChatGPT

المستخدم:
@ahmad

منذ دقيقة

Click:

→ Open Order


---

130. TELEGRAM USER CHAT BUTTON

في Order:

💬 فتح محادثة Telegram

إذا Username:

افتح Telegram باستخدام deep link مناسب.

إذا لا يوجد Username:

اعرض:

لا يتوفر Username لهذا المستخدم، ولا يمكن إنشاء رابط محادثة مباشر آمن اعتماداً على Telegram ID فقط.


---

131. TELEGRAM USER PROFILE

اعرض:

@username
First Name
Last Name
Telegram ID
Phone
Language


---

132. ADMIN NOTES

يمكن إضافة:

ملاحظة داخلية

لا تصل:

Telegram User

Telegram Group

Notifications



---

133. ERROR HANDLING

إذا Telegram Notification failed:

لا تفشل Order.

سجل:

TELEGRAM_NOTIFICATION_FAILED

مع retry.


---

134. HEALTH CHECK

/api/health
/api/ready

تحقق:

Application
MongoDB
Configuration


---

135. DOCKER

أنشئ:

Dockerfile
docker-compose.yml
.dockerignore
.env.example

Services:

app
mongodb

MongoDB persistent volume.

Production multi-stage Dockerfile.


---

136. ENVIRONMENT

NODE_ENV=
MONGODB_URI=
MONGODB_DB_NAME=

AUTH_SECRET=

ENCRYPTION_KEY=

TELEGRAM_WEBHOOK_BASE_URL=

GRIDFS_BUCKET=appFiles

NEXT_PUBLIC_APP_URL=

أضف:

TOTP_ISSUER=

مثلاً:

TOTP_ISSUER=Syrian Request Platform


---

137. SEED

npm run seed

ينشئ:

Super Admin
Demo Admin
Example Bot
Example Request
Dynamic Fields

Credentials عبر Environment Variables.


---

138. PROJECT STRUCTURE

استخدم Architecture نظيفة مثل:

src/

app/
  (auth)/
  dashboard/
  bots/
  requests/
  orders/
  groups/
  blocked-users/
  notifications/
  users/
  settings/
  api/

components/
  ui/
  dashboard/
  bots/
  requests/
  orders/
  groups/
  blocked-users/
  notifications/
  users/
  settings/
  telegram/
  files/

lib/
  db/
  auth/
  security/
  telegram/
  storage/
  validation/

services/
  auth/
  users/
  sessions/
  two-factor/
  bots/
  requests/
  orders/
  telegram/
  groups/
  blocks/
  files/
  notifications/
  audit/

types/
hooks/
config/


---

139. TESTING

Unit Tests:

Order Number
Status Transition
Permissions
Validation
Block
2FA
Notification
Filter Builder

Integration:

Auth
2FA
Orders
Requests
Blocks
GridFS
Notifications
Telegram Webhook

E2E:

Login
2FA
Create Request
Add Fields
Activate
Telegram Start
Create Order
Admin Notification
Open Notification
Open Order
Change Status
User Notification
Group Notification
Block User
Unblock
Archive


---

140. 2FA E2E TEST

يجب اختبار:

Admin Login
↓
No 2FA
↓
Show optional setup
↓
Skip
↓
Dashboard

Settings
↓
Enable 2FA
↓
Generate Secret
↓
Generate QR
↓
Scan using Google Authenticator
↓
Enter Code
↓
Enabled

Logout
↓
Login
↓
Password
↓
2FA Code
↓
Dashboard

Settings
↓
Change 2FA
↓
Current Password
↓
Current Code
↓
New QR
↓
New Code
↓
Success

Remove 2FA
↓
Password
↓
Current Code
↓
2FA Disabled


---

141. NOTIFICATION E2E TEST

Telegram User
↓
Submit Order
↓
Order Created
↓
Admin Notification Created
↓
Unread Count +1
↓
Admin clicks Notification
↓
Notification Read
↓
Navigate to Order


---

142. DYNAMIC REQUEST E2E TEST

Admin creates Request
↓
Request appears in Sidebar
↓
Click Request
↓
Subtabs appear
↓
PENDING
REVIEWING
COMPLETED
REJECTED
ARCHIVED
↓
Dynamic columns generated
↓
Dynamic filters generated
↓
Filter applied server-side
↓
Order displayed


---

143. BLOCK E2E

Order
↓
Block User
↓
User cannot create same Request
↓
User can create another Request
↓
Admin Unblock
↓
User can create Request


---

144. SECURITY E2E

اختبر:

Admin A cannot see Admin B Orders
Admin cannot modify unauthorized Request
Blocked User cannot bypass block
Revoked Session cannot login
Disabled Admin cannot access API
Invalid 2FA code rejected
Expired TOTP rejected
Used Recovery Code cannot be reused
Unauthorized file cannot be downloaded
Sensitive data never appears in logs
Sensitive data never appears in groups
Bot token never appears in API response


---

145. PERFORMANCE

اهتم بـ:

MongoDB indexes

Pagination

Cursor pagination

Aggregation

Streaming

Lazy loading

Server Components

Dynamic imports

Optimized images

Avoid unnecessary queries

Notification unread count optimization



---

146. NEXT.JS

استخدم App Router.

استفد من:

Server Components

Route Handlers

Server Actions عند الحاجة

Suspense

Streaming

Caching

Instant navigation capabilities حيث تكون مناسبة


لكن:

كل Server Action يجب أن يتحقق من Authorization.


---

147. UI COMPONENTS

أنشئ:

AppSidebar
MobileSidebar
PageHeader
Breadcrumbs
StatCard
DataTable
MobileDataCard
StatusBadge
EmptyState
LoadingState
ErrorState
ConfirmDialog
FormDialog
TwoFactorDialog
QrCodeDialog
FileUploader
FilePreview
Timeline
ActivityTimeline
NotificationBell
NotificationItem
NotificationBadge
FilterBuilder
DynamicTable
DynamicTabs
SearchInput
FilterBar
Pagination
CommandMenu
Toast


---

148. DYNAMIC FILTER COMPONENT

Component:

DynamicFilterBuilder

Props:

requestType
fields

يستخرج:

field types
operators
validation

ويولد UI تلقائياً.


---

149. DYNAMIC TABLE COMPONENT

Component:

DynamicOrderTable

يستقبل:

requestType
orders
fields
filters
sorting
pagination

ويبني Columns تلقائياً.


---

150. RESPONSIVE FILTER

Desktop:

Dropdown panel.

Mobile:

Bottom Sheet.


---

151. DIALOGS

ممنوع:

alert()
confirm()
prompt()

استخدم Dialogs احترافية.


---

152. TOASTS

استخدم Toast System.

Examples:

تم إنشاء الطلب
تم تحديث الطلب
تم حظر المستخدم
تم إلغاء الحظر
تم تشغيل البوت
تم إيقاف البوت
تم رفع الملف
تم تفعيل التحقق بخطوتين
تم تغيير التحقق بخطوتين
تمت إزالة التحقق بخطوتين


---

153. LOADING

استخدم:

Skeleton
Button loading
Progress
Suspense


---

154. EMPTY STATES

مثلاً:

لا توجد طلبات قيد الانتظار.

ستظهر الطلبات الجديدة هنا عند وصولها.


---

155. ACCESSIBILITY

دعم:

Keyboard

Focus

Screen Readers

aria

Semantic HTML

Contrast

Reduced Motion



---

156. RTL

العربية RTL على مستوى التطبيق.

استخدم:

dir="rtl"

واستخدم CSS Logical Properties.


---

157. INTERNATIONALIZATION

ابدأ:

ar

لكن Architecture تدعم:

en

مستقبلاً.

لا تضع جميع النصوص داخل Components بشكل hard-coded.


---

158. TIME

خزن كل timestamps:

UTC

واعرضها حسب Timezone المناسب للمستخدم.


---

159. LOGGING

Structured JSON logs:

{
  "timestamp": "...",
  "level": "info",
  "service": "telegram",
  "action": "ORDER_CREATED",
  "requestId": "...",
  "orderId": "...",
  "botId": "..."
}

ممنوع:

Password
TOTP Secret
TOTP Code
Bot Token
Session Token
Sensitive Fields


---

160. CORRELATION ID

كل operation مهم:

requestId

يربط:

HTTP
DB
Telegram
Notification
Audit
Error


---

161. DATABASE MIGRATION

أنشئ migration/version mechanism.

مثلاً:

databaseVersion

Migration idempotent.


---

162. DATABASE CONNECTION

MongoClient singleton.

Connection pool.

Graceful shutdown.


---

163. TRANSACTIONS

استخدم MongoDB transactions عندما تكون مناسبة.

لكن تذكر:

GridFS operations لا تعامل معها كأنها جزء من transaction واحدة مع Order.

استخدم compensation / cleanup عند الحاجة.


---

164. RATE LIMITING

Rate-limit:

Login
2FA
Password Change
File Upload
Telegram Webhook
Sensitive APIs


---

165. TELEGRAM IDEMPOTENCY

احفظ Telegram Update ID.

لا تعالج Update مرتين.


---

166. NOTIFICATION IDEMPOTENCY

لا ترسل Notification مكررة بسبب:

Retry

Webhook duplicate

Server restart


استخدم idempotency key مناسب.


---

167. REQUEST ARCHIVE

إذا تم تعطيل Request:

الطلبات القديمة تبقى.

لا يتم حذف:

Orders

Files

Logs

Notifications



---

168. ADMIN ACTIVITY

Admin profile:

آخر تسجيل دخول
آخر نشاط
Sessions
Activity
Security Events


---

169. SUPER ADMIN SECURITY

Super Admin لا يمكن أن:

يرى Password

يرى Session Token

يرى TOTP Secret

يرى Recovery Codes



---

170. PASSWORD POLICY

ضع policy:

minimum length
complexity
password history

بدون جعلها مزعجة جداً.


---

171. 2FA RECOVERY

إذا فقد المستخدم Google Authenticator:

استخدم Recovery Code.

كل Recovery Code:

single-use

بعد استخدامه:

usedAt

ولا يمكن استخدامه مرة ثانية.


---

172. 2FA AUDIT

سجل:

2FA_SETUP_STARTED
2FA_ENABLED
2FA_VERIFICATION_FAILED
2FA_DISABLED
2FA_SECRET_CHANGED
RECOVERY_CODE_USED

لكن لا تسجل الأسرار أو الرموز.


---

173. 2FA QR

QR يحتوي على otpauth:// URI وفق TOTP standard.

لا ترسل Secret إلى Client إلا أثناء Setup / Reconfiguration المصرح به.


---

174. TELEGRAM PAYMENT EXAMPLE

Request:

طلب شراء حساب ChatGPT

Flow:

Email
↓
Password
↓
Payment Instruction
↓
QR
↓
Payment Proof
↓
Review
↓
Submit


---

175. ORDER SUMMARY

Admin Summary:

#ORD-00001

طلب شراء حساب ChatGPT

👤 @ahmad

📧 email@example.com

💳 Payment Proof:
payment.jpg

🕐 24 أغسطس 2026 11:30

🟡 قيد الانتظار

لكن:

Password:
••••••••


---

176. TELEGRAM GROUP SUMMARY

Group:

🆕 طلب جديد

#ORD-00001

طلب شراء حساب ChatGPT

👤 @ahmad

🕐 11:30

🟡 قيد الانتظار

لا تعرض Password.


---

177. USER CONFIRMATION

Telegram:

✅ تم إرسال طلبك بنجاح.

رقم الطلب:

#ORD-00001

سيتم إعلامك عند تحديث الطلب.


---

178. ADMIN NOTIFICATION

Dashboard:

🆕 طلب جديد

#ORD-00001

طلب شراء حساب ChatGPT

@ahmad

منذ دقيقة

Click → Order.


---

179. ARCHIVED NOTIFICATION RULE

عند:

ARCHIVED

لا ترسل:

Telegram notification

للمستخدم.


---

180. FINAL PROJECT STRUCTURE

يجب أن يكون النظام:

UI
 ↓
API
 ↓
Auth
 ↓
Authorization
 ↓
Services
 ↓
MongoDB / GridFS

Telegram:

Telegram
 ↓
Webhook
 ↓
Update Processor
 ↓
Conversation
 ↓
Request
 ↓
Order
 ↓
Notifications
 ↓
Admin


---

181. DOCUMENTATION

أنشئ:

README.md
ARCHITECTURE.md
DATABASE.md
SECURITY.md
TELEGRAM.md
2FA.md
NOTIFICATIONS.md
FILTERS.md
DEPLOYMENT.md
API.md
AUDIT_LOGS.md
.env.example


---

182. DEVELOPMENT PHASES

نفذ بالترتيب:

Phase 1

Foundation

Phase 2

Authentication + Sessions

Phase 3

2FA

Phase 4

Super Admin

Phase 5

Admin Dashboard + UI

Phase 6

Bots

Phase 7

Request Builder

Phase 8

Dynamic Request Tabs

Phase 9

Orders

Phase 10

Dynamic Tables + Filters

Phase 11

GridFS

Phase 12

Telegram Bot

Phase 13

Telegram Groups

Phase 14

Notifications

Phase 15

Blocked Users

Phase 16

Audit Logs

Phase 17

Security Hardening

Phase 18

Testing

Phase 19

Docker / Production

Phase 20

UI Polish + Animation + Performance


---

183. AFTER EVERY PHASE

شغل:

npm run lint
npm run typecheck
npm test
npm run build

إذا فشل شيء:

1. أصلح الخطأ.


2. أعد الاختبار.


3. لا تنتقل قبل استقرار المرحلة.




---

184. CURSOR AGENT RULES

مهم جداً:

لا تستخدم Mock Data في Production.

لا تستخدم Fake APIs.

لا تضع TODO بدلاً من Feature أساسية.

لا تتجاوز Authorization.

لا تخزن Secrets في Git.

لا تخزن Passwords plain text.

لا تسجل Sensitive Data.

لا ترسل Passwords إلى Telegram Groups.

لا تعتمد على Client-side authorization.

لا تستخدم localStorage لتخزين Authentication Tokens.

لا تستخدم alert() أو confirm().

لا تستخدم countDocuments() لإنشاء Order Number.

لا تجلب كل Orders إلى Browser.

لا تضع MongoDB query raw من User input.

لا تجعل Telegram Conversation تعتمد على RAM.

لا تجعل Notification تعتمد على refresh يدوي فقط.


---

185. FINAL ACCEPTANCE TEST

يجب أن ينجح السيناريو التالي بالكامل:

Super Admin

Login
↓
Create Admin
↓
Admin Login

2FA

Admin Login
↓
Skip 2FA Setup
↓
Dashboard

Settings
↓
Enable 2FA
↓
QR
↓
Google Authenticator
↓
Code
↓
Enabled

Logout
↓
Login
↓
Password
↓
TOTP
↓
Dashboard

Bot

Create Bot
↓
Configure Webhook
↓
Start

Request

Create Request
↓
Request appears automatically in Sidebar
↓
Add Dynamic Fields
↓
Upload QR
↓
Activate

Telegram

/start
↓
الطلبات
↓
Request
↓
Fields
↓
Payment
↓
Attachment
↓
Review
↓
Confirm
↓
ORD-00001

Notifications

Order Created
↓
Admin Notification
↓
Unread Count +1
↓
Click Notification
↓
Mark Read
↓
Open Order

Dynamic Request Page

Click Request Tab
↓
PENDING
REVIEWING
COMPLETED
REJECTED
ARCHIVED
↓
Dynamic Columns
↓
Dynamic Filters
↓
Operator
↓
Value
↓
Server-side query

Telegram Chat

Order
↓
Open Telegram
↓
Telegram User Chat

Admin Update

Change Status
↓
Message
↓
Attachment
↓
User Notification
↓
Group Notification

Block

Block User
↓
User cannot use this Request
↓
Can use another Request
↓
Unblock
↓
Can use Request

Archive

Archive
↓
No User Notification
↓
Audit Log
↓
Order remains visible

2FA Change

Settings
↓
Change 2FA
↓
Password
↓
Current TOTP
↓
New QR
↓
New TOTP
↓
New Recovery Codes

2FA Remove

Settings
↓
Remove 2FA
↓
Password
↓
Current TOTP
↓
Remove
↓
Audit Log


---

186. FINAL QUALITY BAR

لا تعتبر المشروع منجزاً إلا إذا كان:

Production Ready
Secure
Type Safe
Responsive
Arabic RTL
Animated
Accessible
Scalable
Maintainable
Tested
Docker Ready
MongoDB Ready
GridFS Ready
Telegram Ready
2FA Ready
Notification Ready
Audit Ready

ويجب أن تكون جميع الميزات End-to-End حقيقية وليست مجرد واجهات.

**ابدأ الآن بفحص المشروع الحالي، ثم نفّذ Phase 1، وبعد نجاح الاختبارات انتقل تلقائياً إلى Phase 2 وهكذا حتى اكتمال المشروع بالكامل.**