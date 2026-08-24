import { json } from "@/lib/api/http";

export async function GET() {
  return json({ ok: true, service: "bothub" });
}
