import { Refusal, actorForToken } from "@/lib/actors.ts";
import { getDb } from "@/lib/db.ts";
import { SESSION_COOKIE, refusalResponse, respond, today } from "@/lib/http.ts";

export function GET(request: Request) {
  return respond(request, ({ actor }) => actor);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  try {
    actorForToken(getDb(), token, today());
  } catch (error) {
    if (error instanceof Refusal) return refusalResponse(error);
    throw error;
  }
  const headers = new Headers({ location: new URL("/", request.url).toString() });
  headers.append("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 303, headers });
}
