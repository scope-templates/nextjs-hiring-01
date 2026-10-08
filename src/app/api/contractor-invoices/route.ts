import { InvoiceInput, enterInvoice, listInvoices } from "@/lib/contractors.ts";
import { respond } from "@/lib/http.ts";

export function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? undefined;
  return respond(request, (ctx) => listInvoices(ctx, month));
}

export function POST(request: Request) {
  return respond(request, (ctx, body) => enterInvoice(ctx, InvoiceInput.parse(body)), 201);
}
