import { respond } from "@/lib/http.ts";
import { PersonInput, createPerson, listPeople } from "@/lib/people.ts";

export function GET(request: Request) {
  return respond(request, listPeople);
}

export function POST(request: Request) {
  return respond(request, (ctx, body) => createPerson(ctx, PersonInput.parse(body)), 201);
}
