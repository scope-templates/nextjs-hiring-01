import { respond } from "@/lib/http.ts";
import { WorkplaceInput, updateWorkplace } from "@/lib/workplaces.ts";

type Params = { params: Promise<{ location: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { location } = await params;
  return respond(request, (ctx, body) => updateWorkplace(ctx, location, WorkplaceInput.parse(body)));
}
