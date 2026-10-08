import { CandidateInput, addCandidate, listCandidates } from "@/lib/hiring.ts";
import { respond } from "@/lib/http.ts";

export function GET(request: Request) {
  return respond(request, listCandidates);
}

export function POST(request: Request) {
  return respond(request, (ctx, body) => addCandidate(ctx, CandidateInput.parse(body)), 201);
}
