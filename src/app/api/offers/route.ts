import { OfferInput, createOffer, listOffers } from "@/lib/hiring.ts";
import { respond } from "@/lib/http.ts";

export function GET(request: Request) {
  return respond(request, listOffers);
}

export function POST(request: Request) {
  return respond(request, (ctx, body) => createOffer(ctx, OfferInput.parse(body)), 201);
}
