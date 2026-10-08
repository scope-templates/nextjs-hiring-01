import { listOpenings } from "@/lib/hiring.ts";
import { respond } from "@/lib/http.ts";

export function GET(request: Request) {
  return respond(request, listOpenings);
}
