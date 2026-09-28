/**
 * Creates one complaint that exercises every feature (all field types, branching,
 * Telegram prompt blocks, stored files, status workflow, admin fields, chat log).
 *   npx tsx --env-file=.env scripts/seed-full-test.ts          create
 *   npx tsx --env-file=.env scripts/seed-full-test.ts --clean  remove everything it created
 */
import { deflateSync } from "zlib";
import { ObjectId } from "mongodb";
import { collections, getDb } from "../src/lib/db/client";
import { RequestTypeService } from "../src/lib/requests/request-type-service";
import { OrderService } from "../src/lib/orders/order-service";
import { GridFSStorageService } from "../src/lib/storage/gridfs";
import { ChatLogService } from "../src/lib/chat/chat-log-service";
import { TelegramService } from "../src/lib/telegram/telegram-service";
import { PROMPT_FILE_OWNER_TYPE } from "../src/lib/telegram/field-prompt";
import type { BranchingRule } from "../src/lib/requests/branching";
import type { RequestField } from "../src/types";

const TYPE_NAME = "شكوى اختبار شاملة (TEST)";
const TEST_USER_ID = 900000001;
const TEST_USERNAME = "full_feature_test_user";
const FILES = `${process.env.GRIDFS_BUCKET ?? "appFiles"}.files`;
const CHUNKS = `${process.env.GRIDFS_BUCKET ?? "appFiles"}.chunks`;

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function png(width: number, height: number, from: [number, number, number], to: [number, number, number]) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      const stripe = Math.floor(x / 20) % 2 === 0 ? 1 : 0.85;
      for (let ch = 0; ch < 3; ch += 1) {
        raw[row + 1 + x * 3 + ch] = Math.round((from[ch] + (to[ch] - from[ch]) * t) * stripe);
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function pdf(title: string) {
  const content = `BT /F1 20 Tf 60 760 Td (${title}) Tj 0 -30 Td /F1 12 Tf (Shakowa - full feature test document) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function clean() {
  const db = await getDb();
  const types = await db.collection(collections.requestTypes).find({ name: TYPE_NAME }).toArray();
  const typeIds = types.map((t) => String(t._id));
  const orders = await db.collection(collections.orders).find({ requestTypeId: { $in: typeIds } }).toArray();
  const orderIds = orders.map((o) => String(o._id));
  const notifIds = (
    await db.collection(collections.notifications).find({ orderId: { $in: orderIds } }, { projection: { _id: 1 } }).toArray()
  ).map((n) => String(n._id));
  const bucket = db.collection(FILES);
  const fileIds = (
    await bucket
      .find({ $or: [{ "metadata.ownerId": { $in: [...orderIds, ...typeIds] } }, { "metadata.fullFeatureTest": true }] })
      .project({ _id: 1 })
      .toArray()
  ).map((f) => f._id);

  const results = {
    requestTypes: (await db.collection(collections.requestTypes).deleteMany({ name: TYPE_NAME })).deletedCount,
    orders: (await db.collection(collections.orders).deleteMany({ requestTypeId: { $in: typeIds } })).deletedCount,
    history: (await db.collection(collections.orderStatusHistory).deleteMany({ orderId: { $in: orderIds } })).deletedCount,
    audit: (
      await db.collection(collections.auditLogs).deleteMany({ entityId: { $in: [...orderIds, ...typeIds] } })
    ).deletedCount,
    outbox: (
      await db.collection(collections.notificationOutbox).deleteMany({
        $or: [{ notificationId: { $in: notifIds } }, { orderId: { $in: orderIds } }],
      })
    ).deletedCount,
    notifications: (await db.collection(collections.notifications).deleteMany({ orderId: { $in: orderIds } })).deletedCount,
    chat: (await db.collection(collections.telegramChatMessages).deleteMany({ telegramUserId: TEST_USER_ID })).deletedCount,
    telegramUsers: (await db.collection(collections.telegramUsers).deleteMany({ telegramUserId: TEST_USER_ID })).deletedCount,
    files: (await bucket.deleteMany({ _id: { $in: fileIds } })).deletedCount,
    fileChunks: (await db.collection(CHUNKS).deleteMany({ files_id: { $in: fileIds } })).deletedCount,
  };
  console.log("Cleaned:", results);
  for (const botId of new Set(types.map((t) => String(t.botId)))) {
    await TelegramService.syncBotCommands(botId).catch(() => undefined);
  }
}

async function create() {
  const db = await getDb();
  const admin =
    (await db.collection(collections.users).findOne({ role: "ADMIN", status: "ACTIVE" })) ??
    (await db.collection(collections.users).findOne({ role: "SUPER_ADMIN" }));
  if (!admin) throw new Error("No admin user found");
  const actorId = String(admin._id);
  // A running bot would expose the test type and status messages to real Telegram users.
  const bot =
    (await db.collection(collections.bots).findOne({ username: "demo_bot", status: { $ne: "RUNNING" } })) ??
    (await db.collection(collections.bots).findOne({ status: { $ne: "RUNNING" } }, { sort: { createdAt: 1 } }));
  if (!bot) throw new Error("No stopped bot found; refusing to seed test data on a running bot");
  const botId = String(bot._id);

  if (await db.collection(collections.requestTypes).findOne({ name: TYPE_NAME })) {
    throw new Error("Test data already exists; run with --clean first");
  }

  const save = (buffer: Buffer, filename: string, mimeType: string, ownerType: string, ownerId: string, purpose: Parameters<typeof GridFSStorageService.save>[0]["purpose"]) =>
    GridFSStorageService.save({ buffer, filename, mimeType, ownerType, ownerId, uploadedBy: actorId, purpose });

  const promptOwner = new ObjectId().toHexString();
  const promptImage = await save(png(480, 240, [20, 110, 90], [230, 190, 90]), "prompt-guide.png", "image/png", PROMPT_FILE_OWNER_TYPE, promptOwner, "REQUEST_IMAGE");
  const promptDoc = await save(pdf("Complaint guide"), "complaint-guide.pdf", "application/pdf", PROMPT_FILE_OWNER_TYPE, promptOwner, "REQUEST_IMAGE");

  const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
  const f = (field: Partial<RequestField> & Pick<RequestField, "id" | "name" | "label" | "type">): RequestField => ({
    required: false,
    sensitive: false,
    order: 0,
    active: true,
    telegramMessage: field.label,
    ...field,
  });

  const fields: RequestField[] = [
    f({
      id: "intro", name: "intro", label: "تعليمات تقديم الشكوى", type: "INSTRUCTION",
      telegramPrompt: {
        blocks: [
          { id: "b1", type: "text", text: "مرحباً 👋\nهذه شكوى اختبار شاملة. اتبع التعليمات في الصورة والملف المرفقين." },
          { id: "b2", type: "image", storageId: promptImage },
          { id: "b3", type: "document", storageId: promptDoc },
        ],
      },
    }),
    f({ id: "full-name", name: "full_name", label: "الاسم الكامل", type: "TEXT", required: true, validation: { min: 3, max: 60 } }),
    f({ id: "email", name: "email", label: "البريد الإلكتروني", type: "EMAIL", required: true }),
    f({ id: "password", name: "account_password", label: "كلمة مرور الحساب", type: "PASSWORD" }),
    f({ id: "age", name: "age", label: "العمر", type: "NUMBER" }),
    f({ id: "phone", name: "phone", label: "رقم الهاتف", type: "PHONE", required: true }),
    f({ id: "website", name: "website", label: "رابط ذو صلة", type: "URL" }),
    f({ id: "incident-date", name: "incident_date", label: "تاريخ الحادثة", type: "DATE" }),
    f({ id: "incident-datetime", name: "incident_datetime", label: "وقت الحادثة بالتحديد", type: "DATETIME" }),
    f({
      id: "governorate", name: "governorate", label: "المحافظة", type: "SELECT", required: true,
      options: opts([["damascus", "دمشق"], ["aleppo", "حلب"], ["homs", "حمص"], ["latakia", "اللاذقية"]]),
    }),
    f({
      id: "category", name: "complaint_category", label: "نوع الشكوى", type: "RADIO", required: true,
      options: opts([["service", "خدمة"], ["employee", "موظف"], ["other", "أخرى"]]),
    }),
    f({ id: "employee-name", name: "employee_name", label: "اسم الموظف المشكو منه", type: "TEXT", required: true }),
    f({ id: "other-details", name: "other_details", label: "تفاصيل النوع الآخر", type: "TEXTAREA", required: true }),
    f({
      id: "services", name: "affected_services", label: "الخدمات المتأثرة", type: "CHECKBOX",
      options: opts([["water", "المياه"], ["power", "الكهرباء"], ["internet", "الإنترنت"], ["transport", "النقل"]]),
    }),
    f({
      id: "has-evidence", name: "has_evidence", label: "هل لديك أدلة؟", type: "RADIO", required: true,
      options: opts([["yes", "نعم"], ["no", "لا"]]),
    }),
    f({ id: "evidence-image", name: "evidence_image", label: "صورة الدليل", type: "IMAGE", required: true }),
    f({ id: "evidence-file", name: "evidence_file", label: "ملف الدليل", type: "FILE" }),
    f({ id: "location", name: "incident_location", label: "موقع الحادثة (أي نوع رسالة)", type: "DYNAMIC" }),
    f({ id: "description", name: "description", label: "وصف الشكوى", type: "TEXTAREA", required: true, validation: { min: 10 } }),
    f({ id: "legacy-note", name: "legacy_note", label: "ملاحظة من نسخة سابقة للنموذج", type: "TEXT" }),
    f({ id: "agree", name: "agree_terms", label: "أقر بصحة المعلومات", type: "CONFIRMATION", required: true }),
  ];

  const rules: BranchingRule[] = [
    { id: "r-show-employee", sourceFieldId: "category", operator: "equals", value: "employee", action: "show", targetFieldId: "employee-name" },
    { id: "r-show-other", sourceFieldId: "category", operator: "equals", value: "other", action: "show", targetFieldId: "other-details" },
    { id: "r-hide-website", sourceFieldId: "email", operator: "is_empty", action: "hide", targetFieldId: "website" },
    { id: "r-goto-desc", sourceFieldId: "has-evidence", operator: "equals", value: "no", action: "goto", targetFieldId: "description" },
  ];

  const { id: requestTypeId } = await RequestTypeService.create({
    name: TYPE_NAME,
    botId,
    description: "نوع شكوى للاختبار يغطي جميع أنواع الحقول وقواعد التفرع ورسائل Telegram متعددة العناصر.",
    fields,
    branchingRules: rules,
    active: true,
    actorId,
  });

  const orderOwner = new ObjectId().toHexString();
  const evidenceImage = await save(png(640, 400, [200, 60, 60], [60, 60, 200]), "evidence-photo.png", "image/png", "order", orderOwner, "REQUEST_IMAGE");
  const evidenceFile = await save(pdf("Evidence report"), "evidence-report.pdf", "application/pdf", "order", orderOwner, "ORDER_ATTACHMENT");

  const answers: Record<string, unknown> = {
    full_name: "أحمد محمد الاختبار",
    email: "ahmad.test@example.com",
    account_password: "Secret#2026",
    age: 34,
    phone: "+963944123456",
    website: "https://example.com/complaint-reference",
    incident_date: "2026-09-20",
    incident_datetime: "2026-09-20 14:30",
    governorate: "damascus",
    complaint_category: "employee",
    employee_name: "موظف النافذة رقم 3",
    other_details: "يجب أن يُحذف لأن الحقل مخفي بقاعدة التفرع",
    affected_services: ["water", "internet"],
    has_evidence: "yes",
    evidence_image: { telegramFileId: "AgACAgQAAxkBAAIBfullFeatureTestPhoto01", kind: "photo", gridFsId: evidenceImage, filename: "evidence-photo.png" },
    evidence_file: { telegramFileId: "BQACAgQAAxkBAAIBfullFeatureTestDoc0001", kind: "document", gridFsId: evidenceFile, filename: "evidence-report.pdf" },
    incident_location: {
      inputType: "dynamic",
      contentType: "location",
      text: "📍 33.5138, 36.2765",
      metadata: { latitude: 33.5138, longitude: 36.2765 },
    },
    description:
      "راجعت المكتب ثلاث مرات لإنجاز معاملة المياه ولم يتم إنجازها.\nالموظف رفض استلام الأوراق دون سبب واضح.\nأرفقت صورة الإيصال وتقرير PDF.",
    legacy_note: "هذه الإجابة لحقل حُذف لاحقاً من النموذج",
    agree_terms: true,
  };

  const chat = (direction: "in" | "out", text: string | null, extra: Partial<Parameters<typeof ChatLogService.append>[0]> = {}, minutesAgo = 0) =>
    ChatLogService.append({
      botId,
      telegramUserId: TEST_USER_ID,
      chatId: TEST_USER_ID,
      direction,
      actor: direction === "in" ? "user" : "bot",
      text,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
      ...extra,
    });

  await db.collection(collections.telegramUsers).updateOne(
    { telegramUserId: TEST_USER_ID },
    {
      $set: { username: TEST_USERNAME, firstName: "أحمد", lastName: "الاختبار", languageCode: "ar", isPremium: false, lastSeenAt: new Date() },
      $setOnInsert: { telegramUserId: TEST_USER_ID, firstSeenAt: new Date(), phoneNumber: null },
    },
    { upsert: true },
  );
  await chat("in", "/start", { kind: "command" }, 30);
  await chat("out", "اختر نوع الشكوى:", {}, 30);
  await chat("in", TYPE_NAME, {}, 29);

  const { id: orderId, orderNumber } = await OrderService.submit({
    botId,
    requestTypeId,
    telegramUserId: TEST_USER_ID,
    chatId: TEST_USER_ID,
    telegramUsername: TEST_USERNAME,
    telegramName: "أحمد الاختبار",
    fields: answers,
  });

  await db.collection(FILES).updateMany(
    { _id: { $in: [evidenceImage, evidenceFile, promptImage, promptDoc].map((id) => new ObjectId(id)) } },
    { $set: { "metadata.ownerId": orderId, "metadata.fullFeatureTest": true } },
  );

  await chat("out", `تم استلام شكواك ✅\nرقم الشكوى: #${orderNumber}`, { orderId }, 20);
  await chat("in", "متى سيتم الرد على شكواي؟", { orderId }, 15);
  await chat("in", null, {
    orderId, kind: "photo", filename: "evidence-photo.png", mimeType: "image/png", gridFsId: evidenceImage,
  }, 14);

  await OrderService.changeStatus({ orderId, next: "REVIEWING", actorId, message: "استلمنا شكواك وهي قيد المراجعة الآن." });
  await OrderService.changeStatus({ orderId, next: "IN_PROGRESS", actorId, message: "تم تحويل الشكوى إلى القسم المختص." });

  const adminAttachment = await save(pdf("Internal admin memo"), "admin-memo.pdf", "application/pdf", "order", orderId, "ADMIN_ATTACHMENT");
  await db.collection(FILES).updateOne({ _id: new ObjectId(adminAttachment) }, { $set: { "metadata.fullFeatureTest": true } });
  await OrderService.updateAdminFields({
    orderId,
    actorId,
    adminNotes: "ملاحظة داخلية: تم التواصل مع مدير الفرع.\nلا تظهر للمستخدم.",
    attachmentFileId: adminAttachment,
    attachmentFilename: "admin-memo.pdf",
  });

  const statusFile = await save(png(400, 260, [40, 140, 80], [240, 240, 240]), "resolution-receipt.png", "image/png", "order", orderId, "ADMIN_ATTACHMENT");
  await db.collection(FILES).updateOne({ _id: new ObjectId(statusFile) }, { $set: { "metadata.fullFeatureTest": true } });
  await OrderService.changeStatus({
    orderId,
    next: "RESOLVED",
    actorId,
    message: "تم إنجاز معاملتك، يمكنك مراجعة المكتب لاستلامها.",
    attachmentFileId: statusFile,
    resolutionNote: "تمت معالجة المعاملة وتوجيه تنبيه للموظف المعني.",
  });

  await chat("in", "شكراً لكم 🙏", { orderId }, 1);

  const live = fields.filter((field) => field.id !== "legacy-note");
  await RequestTypeService.updateFields(requestTypeId, live, actorId, rules);

  console.log(JSON.stringify({ requestTypeId, orderId, orderNumber, url: `/complaints/${orderId}` }, null, 2));
}

(process.argv.includes("--clean") ? clean() : create())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
