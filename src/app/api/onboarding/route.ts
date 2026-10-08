import { respond } from "@/lib/http.ts";
import { listOnboarding } from "@/lib/people.ts";

export function GET(request: Request) {
  return respond(request, listOnboarding);
}
