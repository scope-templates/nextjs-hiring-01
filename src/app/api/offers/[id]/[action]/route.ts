import { Refusal } from "@/lib/actors.ts";
import { ApprovalInput, SignInput, approveOffer, closeOffer, sendOffer, signOffer } from "@/lib/hiring.ts";
import { respond } from "@/lib/http.ts";

type Params = { params: Promise<{ id: string; action: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: raw, action } = await params;
  const id = Number(raw);
  return respond(request, (ctx, body) => {
    switch (action) {
      case "approve":
        return approveOffer(ctx, id, ApprovalInput.parse(body));
      case "send":
        return sendOffer(ctx, id);
      case "sign":
        return signOffer(ctx, id, SignInput.parse(body));
      case "decline":
        return closeOffer(ctx, id, "declined");
      case "withdraw":
        return closeOffer(ctx, id, "withdrawn");
      default:
        throw new Refusal(404, "not_found", `No offer action ${action}`);
    }
  });
}
