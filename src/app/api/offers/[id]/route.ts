import { getOffer } from "@/lib/hiring.ts";
import { respond } from "@/lib/http.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return respond(request, (ctx) => getOffer(ctx, Number(id)));
}
