import { headers } from "next/headers";
import { ZodError } from "zod";
import { type Ctx, Refusal, actorForToken } from "./actors.ts";
import { getDb } from "./db.ts";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const SESSION_COOKIE = "session";

function contextFor(h: Headers): Ctx {
  const authorization = h.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (authorization !== null && !bearer) {
    throw new Refusal(401, "bad_token", "The Authorization header must be Bearer <token>");
  }
  const cookie = h
    .get("cookie")
    ?.split(/;\s*/)
    .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const token = bearer ?? (cookie ? decodeURIComponent(cookie) : undefined);
  const db = getDb();
  const date = today();
  return { db, actor: actorForToken(db, token, date), today: date };
}

export function refusalResponse(error: Refusal): Response {
  return Response.json({ error: error.code, message: error.message }, { status: error.status });
}

export async function respond(
  request: Request,
  run: (ctx: Ctx, body: unknown) => unknown,
  status = 200,
): Promise<Response> {
  try {
    const ctx = contextFor(request.headers);
    const text = request.method === "GET" ? "" : await request.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      throw new Refusal(400, "bad_json", "The request body must be JSON");
    }
    return Response.json(run(ctx, body), { status });
  } catch (error) {
    if (error instanceof Refusal) return refusalResponse(error);
    if (error instanceof ZodError) {
      return Response.json({ error: "invalid", issues: error.issues }, { status: 422 });
    }
    throw error;
  }
}

export async function pageCtx(): Promise<Ctx | undefined> {
  const requestHeaders = await headers();
  try {
    return contextFor(requestHeaders);
  } catch (error) {
    if (error instanceof Refusal) return undefined;
    throw error;
  }
}
