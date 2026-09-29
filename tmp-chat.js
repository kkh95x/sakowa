const { MongoClient } = require("mongodb");
(async () => {
  const c = new MongoClient(process.env.MONGODB_URI);
  await c.connect();
  const rows = await c
    .db(process.env.MONGODB_DB_NAME)
    .collection("telegramChatMessages")
    .find({ chatId: 6359321348 })
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();
  for (const r of rows) {
    console.log(
      JSON.stringify({
        at: r.createdAt,
        dir: r.direction,
        kind: r.kind,
        mid: r.telegramMessageId,
        text: String(r.text || "").slice(0, 80),
        filename: r.filename,
      }),
    );
  }
  await c.close();
})();
