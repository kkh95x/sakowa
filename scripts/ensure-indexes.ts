import { ensureIndexes } from "../src/lib/db/indexes";

async function main() {
  await ensureIndexes();
  console.log("Indexes ensured");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
