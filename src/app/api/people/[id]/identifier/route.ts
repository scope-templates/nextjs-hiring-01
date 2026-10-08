import { respond } from "@/lib/http.ts";
import { IdentifierInput, readIdentifier, setIdentifier } from "@/lib/people.ts";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  return respond(request, (ctx) => readIdentifier(ctx, id));
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  return respond(request, (ctx, body) => setIdentifier(ctx, id, IdentifierInput.parse(body)));
}
