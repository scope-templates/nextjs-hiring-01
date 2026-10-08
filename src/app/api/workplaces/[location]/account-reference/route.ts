import { respond } from "@/lib/http.ts";
import { readAccountReference } from "@/lib/workplaces.ts";

type Params = { params: Promise<{ location: string }> };

export async function GET(request: Request, { params }: Params) {
  const { location } = await params;
  return respond(request, (ctx) => readAccountReference(ctx, location));
}
