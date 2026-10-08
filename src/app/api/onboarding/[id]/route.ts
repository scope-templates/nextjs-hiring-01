import { respond } from "@/lib/http.ts";
import { StepDoneInput, completeStep } from "@/lib/people.ts";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return respond(request, (ctx, body) => completeStep(ctx, Number(id), StepDoneInput.parse(body)));
}
