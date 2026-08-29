import { migrate } from "../src/lib/db/migrate";
import { collections, getDb } from "../src/lib/db/client";
import { ensureSuperAdmin, upsertSeedUser } from "../src/lib/db/bootstrap";

async function main() {
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ??
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
  process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? "bothub";

  await migrate();

  const superResult = await ensureSuperAdmin();
  const superUser = process.env.SEED_SUPER_ADMIN_USERNAME ?? "superadmin";

  const adminUser = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!Admin1";
  const { id: adminId } = await upsertSeedUser(adminUser, "Demo Admin", adminPass, "ADMIN");

  const db = await getDb();

  const bot = await db.collection(collections.bots).findOne({ username: "demo_bot" });
  let botId = bot ? String(bot._id) : null;
  if (!bot) {
    const inserted = await db.collection(collections.bots).insertOne({
      name: "Demo Bot",
      username: "demo_bot",
      telegramBotId: 0,
      tokenEncrypted: null,
      webhookSecret: "seed-secret",
      status: "STOPPED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    botId = String(inserted.insertedId);
  }

  const existingRt = await db.collection(collections.requestTypes).findOne({ slug: "chatgpt-account" });
  if (!existingRt && botId) {
    await db.collection(collections.requestTypes).insertOne({
      name: "طلب شراء حساب ChatGPT",
      slug: "chatgpt-account",
      botId,
      description: "مثال",
      fields: [
        {
          id: "1",
          name: "email",
          label: "البريد الإلكتروني",
          type: "EMAIL",
          required: true,
          sensitive: false,
          order: 0,
          active: true,
          telegramMessage: "📧 يرجى إرسال البريد الإلكتروني الشخصي",
        },
        {
          id: "2",
          name: "password",
          label: "كلمة المرور",
          type: "PASSWORD",
          required: true,
          sensitive: false,
          order: 1,
          active: true,
          telegramMessage: "🔒 أرسل كلمة المرور",
        },
        {
          id: "3",
          name: "payment_proof",
          label: "إثبات الدفع",
          type: "IMAGE",
          required: true,
          sensitive: false,
          order: 2,
          active: true,
          telegramMessage: "📎 أرسل إثبات الدفع",
        },
      ],
      active: true,
      telegramGroupId: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log("Seed complete");
  console.log(`Super Admin: ${superUser}${superResult.created ? " (created)" : ""}`);
  console.log(`Admin: ${adminUser} (${adminId})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
