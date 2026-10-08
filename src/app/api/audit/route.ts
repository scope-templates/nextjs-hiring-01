import { listAudit } from "@/lib/actors.ts";
import { respond } from "@/lib/http.ts";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return respond(request, (ctx) =>
    listAudit(ctx, params.get("entity") ?? undefined, params.get("entity_id") ?? undefined),
  );
}
