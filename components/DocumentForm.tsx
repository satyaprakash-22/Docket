"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DocumentFormProps {
  mode: "create" | "edit";
  documentId?: string;
  initialTitle?: string;
  initialBody?: string;
  expectedVersion?: number;
}

export function DocumentForm({
  mode,
  documentId,
  initialTitle = "",
  initialBody = "",
  expectedVersion,
}: DocumentFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const url =
        mode === "create"
          ? "/api/documents"
          : `/api/documents/${documentId}`;

      const method = mode === "create" ? "POST" : "PATCH";

      const bodyPayload =
        mode === "create"
          ? { title, body }
          : { title, body, expectedVersion };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "An error occurred. Please try again.");
        setLoading(false);
        return;
      }

      const doc = data.document;
      router.push(`/documents/${doc.id}`);
      router.refresh();
    } catch {
      setError("Network error. Please check your connection.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="form-group">
        <label htmlFor="doc-title" className="form-label">
          Document Title
        </label>
        <input
          id="doc-title"
          type="text"
          className="form-input"
          placeholder="Enter a clear, descriptive title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="doc-body" className="form-label">
          Document Body
        </label>
        <textarea
          id="doc-body"
          className="form-textarea"
          placeholder="Write the document content here..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          disabled={loading}
          style={{ minHeight: "320px" }}
        />
      </div>

      {error && (
        <div className="form-error">
          <span>⚠️</span>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? (
            <>
              <div className="spinner" style={{ width: "16px", height: "16px" }} />
              {mode === "create" ? "Creating..." : "Saving..."}
            </>
          ) : (
            mode === "create" ? "Create Draft" : "Save Changes"
          )}
        </button>
      </div>
    </form>
  );
}
