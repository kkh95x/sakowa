import { errorToResponse, json, withAuth } from "@/lib/api/http";
import { UserService } from "@/lib/users/user-service";
import { z } from "zod";

export async function GET() {
  try {
    await withAuth(["SUPER_ADMIN"]);
    const users = await UserService.list("ADMIN");
    return json({
      users: users.map((u) => ({
        id: String(u._id),
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        status: u.status,
        twoFactorEnabled: u.twoFactorEnabled,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    return errorToResponse(err);
  }
}

const schema = z.object({
  username: z.string().min(3),
  displayName: z.string().min(1),
  password: z.string().min(10),
});

export async function POST(req: Request) {
  try {
    const actor = await withAuth(["SUPER_ADMIN"]);
    const body = schema.parse(await req.json());
    const id = await UserService.create({ ...body, role: "ADMIN", actorId: actor.id });
    return json({ id });
  } catch (err) {
    return errorToResponse(err);
  }
}
