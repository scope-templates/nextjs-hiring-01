import type { ReactNode } from "react";

export const metadata = { title: "Hiring Board" };

const style = `
body { font: 14px/1.45 system-ui, sans-serif; margin: 24px; color: #1d232a; }
nav a { margin-right: 14px; }
table { border-collapse: collapse; margin: 8px 0 24px; }
th, td { border-bottom: 1px solid #dde1e6; padding: 4px 10px; text-align: left; }
th { background: #f3f5f7; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{style}</style>
      </head>
      <body>
        <nav>
          <strong>Hiring Board</strong> · <a href="/">Home</a>
          <a href="/offers">Offers</a>
          <a href="/onboarding">Onboarding</a>
          <a href="/workplaces">Workplaces</a>
          <a href="/contractors">Contractors</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
