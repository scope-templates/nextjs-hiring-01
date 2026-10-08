import { PaidInput, markInvoicePaid } from "@/lib/contractors.ts";
import { respond } from "@/lib/http.ts";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return respond(request, (ctx, body) => markInvoicePaid(ctx, Number(id), PaidInput.parse(body)));
}
