"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DocStatus, Role, Document, AuditEvent, User } from "@prisma/client";
import { StatusStepper } from "@/components/StatusStepper";
import { AuditTimeline } from "@/components/AuditTimeline";
import { ConflictModal } from "@/components/ConflictModal";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { can } from "@/lib/permissions";

type FullDocument = Document & {
  author: Pick<User, "id" | "name" | "email" | "role">;
};

type FullAuditEvent = AuditEvent & {
  actor: Pick<User, "id" | "name" | "email" | "role">;
};

interface DocumentDetailClientProps {
  document: FullDocument;
  auditEvents: FullAuditEvent[];
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
}

export function DocumentDetailClient({
  document: initialDoc,
  auditEvents: initialEvents,
  user,
}: DocumentDetailClientProps) {
  const router = useRouter();

  const [doc, setDoc] = useState(initialDoc);
  const [events, setEvents] = useState(initialEvents);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reject state
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  // Conflict modal state (409 STALE_VERSION)
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    staleStatus: DocStatus;
    currentStatus: DocStatus;
    currentActor: string;
    currentTimestamp: string;
  }>({
    isOpen: false,
    staleStatus: initialDoc.status,
    currentStatus: initialDoc.status,
    currentActor: "",
    currentTimestamp: "",
  });

  const refreshDocument = async () => {
    try {
      const docRes = await fetch(`/api/documents/${doc.id}`);
      if (docRes.ok) {
        const data = await docRes.json();
        setDoc(data.document);
      }

      const historyRes = await fetch(`/api/documents/${doc.id}/history`);
      if (historyRes.ok) {
        const data = await historyRes.json();
        setEvents(data.events);
      }
    } catch {
      // ignore
    }
  };

  const handleAction = async (actionEndpoint: string, bodyObj: Record<string, unknown> = {}) => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/documents/${doc.id}/${actionEndpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: doc.version,
          ...bodyObj,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Conflict! Fetch latest history to see who changed it
          const historyRes = await fetch(`/api/documents/${doc.id}/history`);
          let actorName = "Another user";
          let timestampStr = "recently";
          let latestStatus = doc.status;

          if (historyRes.ok) {
            const hData = await historyRes.json();
            const latest = hData.events[hData.events.length - 1];
            if (latest) {
              actorName = latest.actor.name;
              timestampStr = new Date(latest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              latestStatus = latest.toStatus ?? doc.status;
            }
          }

          setConflictModal({
            isOpen: true,
            staleStatus: doc.status,
            currentStatus: latestStatus,
            currentActor: actorName,
            currentTimestamp: timestampStr,
          });
        } else {
          setError(data.error?.message ?? "Failed to perform action.");
        }
        setLoading(false);
        return;
      }

      setDoc(data.document);
      setRejecting(false);
      setRejectComment("");
      await refreshDocument();
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const canEdit = can(user, "edit", doc);
  const canSubmit = can(user, "submit", doc);
  const canApprove = can(user, "approve", doc);
  const canReject = can(user, "reject", doc);
  const canReopen = can(user, "reopen", doc);
  const canPublish = can(user, "publish", doc);
  const canArchive = can(user, "archive", doc);
  const canViewPresence = can(user, "viewPresence", doc);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Presence Indicator for Reviewers/Admins */}
      {canViewPresence && <PresenceIndicator documentId={doc.id} />}

      {/* Stepper Card */}
      <div className="card" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Workflow State
          </span>
          <span className={`status-badge status-${doc.status}`}>
            {doc.status}
          </span>
        </div>
        <StatusStepper
          currentStatus={doc.status}
          isRejected={doc.status === DocStatus.REJECTED}
          isArchived={doc.status === DocStatus.ARCHIVED}
        />
      </div>

      {/* Main Document Display */}
      <div className="card" style={{ padding: "36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "16px" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2.25rem", marginBottom: "8px" }}>
              {doc.title}
            </h1>
            <div className="doc-row-meta">
              <span>Author: <strong>{doc.author.name}</strong> ({doc.author.role})</span>
              <span className="meta-dot" />
              <span>Created {new Date(doc.createdAt).toLocaleDateString()}</span>
              <span className="meta-dot" />
              <span>Version <strong>v{doc.version}</strong></span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            {doc.status === DocStatus.PUBLISHED && (
              <Link href={`/documents/${doc.id}/export`} target="_blank" className="btn btn-ghost btn-sm">
                📋 Export Compliance Doc
              </Link>
            )}
            {canEdit && (
              <Link href={`/documents/${doc.id}/edit`} className="btn btn-ghost btn-sm">
                ✏️ Edit Content
              </Link>
            )}
          </div>
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--color-border)", margin: "24px 0" }} />

        <div className="doc-body">
          {doc.body}
        </div>
      </div>

      {/* Action Toolbar */}
      {(canSubmit || canApprove || canReject || canReopen || canPublish || canArchive) && (
        <div className="card" style={{ background: "var(--color-bg-alt)", border: "1px solid var(--color-border-strong)", padding: "24px" }}>
          <h4 style={{ marginBottom: "12px" }}>Available Actions</h4>

          {error && (
            <div className="form-error" style={{ marginBottom: "16px" }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {rejecting ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label className="form-label">
                Rejection Reason <span style={{ color: "var(--color-rejected-text)" }}>* (Required)</span>
              </label>
              <textarea
                className="form-textarea"
                placeholder="Explain clearly why this document is being rejected..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                style={{ minHeight: "100px" }}
              />
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setRejecting(false);
                    setRejectComment("");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleAction("reject", { comment: rejectComment })}
                  disabled={loading || !rejectComment.trim()}
                >
                  {loading ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              {canSubmit && (
                <button
                  className="btn btn-accent"
                  onClick={() => handleAction("submit")}
                  disabled={loading}
                >
                  📨 Submit for Review
                </button>
              )}

              {canApprove && (
                <button
                  className="btn btn-success"
                  onClick={() => handleAction("approve")}
                  disabled={loading}
                >
                  ✅ Approve Document
                </button>
              )}

              {canReject && (
                <button
                  className="btn btn-danger"
                  onClick={() => setRejecting(true)}
                  disabled={loading}
                >
                  ❌ Reject Document
                </button>
              )}

              {canReopen && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleAction("reopen")}
                  disabled={loading}
                >
                  🔄 Reopen to Draft
                </button>
              )}

              {canPublish && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleAction("publish")}
                  disabled={loading}
                >
                  🌐 Publish Document
                </button>
              )}

              {canArchive && (
                <button
                  className="btn btn-ghost"
                  style={{ color: "var(--color-archived-text)" }}
                  onClick={() => handleAction("archive")}
                  disabled={loading}
                >
                  📁 Archive Document
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Audit History Timeline */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h3>Audit History</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
              Immutable append-only record of all status transitions and actions
            </p>
          </div>
          <span style={{ fontSize: "0.75rem", fontFamily: "monospace", background: "var(--color-bg-alt)", padding: "4px 8px", borderRadius: "4px" }}>
            {events.length} event{events.length === 1 ? "" : "s"} logged
          </span>
        </div>

        <AuditTimeline events={events} />
      </div>

      {/* Concurrency Conflict Resolution Modal (Story 8 / Differentiator #1) */}
      <ConflictModal
        isOpen={conflictModal.isOpen}
        staleStatus={conflictModal.staleStatus}
        currentStatus={conflictModal.currentStatus}
        currentActor={conflictModal.currentActor}
        currentTimestamp={conflictModal.currentTimestamp}
        onDiscard={() => setConflictModal((prev) => ({ ...prev, isOpen: false }))}
        onReload={async () => {
          setConflictModal((prev) => ({ ...prev, isOpen: false }));
          await refreshDocument();
        }}
      />
    </div>
  );
}
