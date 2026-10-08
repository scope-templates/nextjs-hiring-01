import { Refusal } from "@/lib/actors.ts";

type Column = [key: string, label: string, format?: (row: Record<string, unknown>) => string];

export function Table({ rows, columns }: { rows: Record<string, unknown>[]; columns: Column[] }) {
  if (rows.length === 0) return <p>Nothing to show.</p>;
  return (
    <table>
      <thead>
        <tr>
          {columns.map(([key, label]) => (
            <th key={key}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map(([key, , format]) => (
              <td key={key}>{format ? format(row) : String(row[key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function money(amount: unknown, currency: unknown): string {
  if (typeof amount !== "number" || typeof currency !== "string") return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function orRefusal<T>(read: () => T): T | Refusal {
  try {
    return read();
  } catch (error) {
    if (error instanceof Refusal) return error;
    throw error;
  }
}

export function SignInFirst() {
  return (
    <p>
      Sign in with your token on the <a href="/">home page</a>.
    </p>
  );
}
