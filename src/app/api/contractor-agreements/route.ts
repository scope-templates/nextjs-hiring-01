import { AgreementInput, addAgreement, listAgreements } from "@/lib/contractors.ts";
import { respond } from "@/lib/http.ts";

export function GET(request: Request) {
  return respond(request, listAgreements);
}

export function POST(request: Request) {
  return respond(request, (ctx, body) => addAgreement(ctx, AgreementInput.parse(body)), 201);
}
