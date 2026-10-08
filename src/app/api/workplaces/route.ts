import { respond } from "@/lib/http.ts";
import { listWorkplaces } from "@/lib/workplaces.ts";

export function GET(request: Request) {
  return respond(request, listWorkplaces);
}
