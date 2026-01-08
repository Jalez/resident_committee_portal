import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;900&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

import { Navigation } from "./components/navigation";

export default function App() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border transition-all duration-300">
        <header className="h-20 sm:h-24 md:h-40 flex items-center justify-center px-4">
          <div className="flex items-center justify-center gap-2 sm:gap-4 md:gap-8 mt-1 sm:mt-2 md:mt-4">
            <span className="text-xl sm:text-3xl md:text-7xl font-black tracking-tighter uppercase text-gray-900 dark:text-white leading-none">
              HIPPOS
            </span>
            <div className="flex flex-col items-start justify-center h-full text-gray-900 dark:text-white uppercase font-black tracking-widest leading-[0.85] border-l-2 md:border-l-4 border-primary pl-3 sm:pl-4 md:pl-10 py-1 md:py-2">
              <span className="text-sm sm:text-2xl md:text-3xl">Asukastoimikunta</span>
              <span className="text-[9px] sm:text-xl md:text-2xl opacity-90 mt-0.5 md:mt-2">Tenant Committee</span>
            </div>
          </div>
        </header>

        <nav className="pb-2 sm:pb-3 md:pb-6">
          <Navigation orientation="horizontal" />
        </nav>
      </div>

      <div className="flex min-h-screen pt-36 sm:pt-40 md:pt-64">
        {/* Main Content */}
        <main className="flex-1 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
