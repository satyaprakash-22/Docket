"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SEEDED_USERS = [
  { name: "Alice Author", email: "alice@example.com", role: "AUTHOR", desc: "Can create, edit, submit, reopen own docs" },
  { name: "Bob Reviewer", email: "bob@example.com", role: "REVIEWER", desc: "Can approve/reject submitted docs & publish approved" },
  { name: "Carol Reviewer", email: "carol@example.com", role: "REVIEWER", desc: "Second reviewer for testing concurrency" },
  { name: "Aman Admin", email: "admin@example.com", role: "ADMIN", desc: "Can archive docs & publish approved docs" },
  { name: "Vikram Viewer", email: "viewer@example.com", role: "VIEWER", desc: "Can view published documents only" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (targetEmail: string) => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Failed to log in.");
        setLoading(false);
        return;
      }

      router.push("/documents");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--color-bg)",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: "520px",
          width: "100%",
          padding: "40px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.25rem",
              marginBottom: "8px",
            }}
          >
            Doc<span style={{ color: "var(--color-accent)" }}>ket</span>
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
            Controlled Document Approval System
          </p>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginBottom: "12px",
            }}
          >
            Select a Seeded Persona to Log In
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {SEEDED_USERS.map((user) => (
              <button
                key={user.email}
                type="button"
                className="card card-hover"
                onClick={() => {
                  setEmail(user.email);
                  handleLogin(user.email);
                }}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  textAlign: "left",
                  background: email === user.email ? "var(--color-accent-light)" : "var(--color-surface)",
                  borderColor: email === user.email ? "var(--color-accent)" : "var(--color-border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                    {user.desc}
                  </div>
                </div>
                <span className="role-badge" style={{ flexShrink: 0, marginLeft: "12px" }}>
                  {user.role}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            textAlign: "center",
            margin: "24px 0",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              borderTop: "1px solid var(--color-border)",
            }}
          />
          <span
            style={{
              position: "relative",
              background: "var(--color-surface)",
              padding: "0 12px",
              fontSize: "0.8125rem",
              color: "var(--color-text-muted)",
            }}
          >
            or enter email manually
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin(email);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <div className="form-group">
            <input
              type="email"
              className="form-input"
              placeholder="e.g. alice@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="form-error">
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
            disabled={loading || !email.trim()}
          >
            {loading ? "Signing in..." : "Continue with Email"}
          </button>
        </form>
      </div>
    </div>
  );
}
