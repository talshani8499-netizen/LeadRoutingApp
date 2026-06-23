"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          backgroundColor: "#f8fafc",
          color: "#1e293b",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            backgroundColor: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.7)",
            borderRadius: "1rem",
            boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
            padding: "2rem",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
            A critical error occurred. Please reload the page to continue.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.75rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              backgroundColor: "#4f46e5",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
