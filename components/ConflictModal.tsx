"use client";

import { DocStatus } from "@prisma/client";

interface ConflictModalProps {
  isOpen: boolean;
  staleStatus: DocStatus;
  currentStatus: DocStatus;
  currentActor: string;
  currentTimestamp: string;
  onDiscard: () => void;
  onReload: () => void;
}

const STATUS_LABELS: Record<DocStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted for Review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

export function ConflictModal({
  isOpen,
  staleStatus,
  currentStatus,
  currentActor,
  currentTimestamp,
  onDiscard,
  onReload,
}: ConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onDiscard}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "24px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "var(--color-rejected-bg)",
              border: "1px solid var(--color-rejected-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              flexShrink: 0,
            }}
          >
            ⚠️
          </div>
          <div>
            <h3 className="modal-title">Document Updated by Another User</h3>
            <p className="modal-subtitle">
              Your action could not be completed because the document was modified since you
              last loaded it. Here's what changed:
            </p>
          </div>
        </div>

        {/* Side-by-side comparison */}
        <div className="conflict-grid">
          <div className="conflict-side stale">
            <div className="conflict-side-label">⏮ Your View (Stale)</div>
            <div style={{ marginBottom: "8px" }}>
              <span
                className={`status-badge status-${staleStatus}`}
                style={{ fontSize: "0.8125rem" }}
              >
                {STATUS_LABELS[staleStatus]}
              </span>
            </div>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-rejected-text)",
              }}
            >
              This was the state when you loaded the page.
            </p>
          </div>

          <div className="conflict-side current">
            <div className="conflict-side-label">✓ Current State</div>
            <div style={{ marginBottom: "8px" }}>
              <span
                className={`status-badge status-${currentStatus}`}
                style={{ fontSize: "0.8125rem" }}
              >
                {STATUS_LABELS[currentStatus]}
              </span>
            </div>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-approved-text)",
              }}
            >
              Changed by <strong>{currentActor}</strong> at {currentTimestamp}.
            </p>
          </div>
        </div>

        {/* What this means */}
        <div
          style={{
            background: "var(--color-bg-alt)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: "24px",
            fontSize: "0.875rem",
            color: "var(--color-text-secondary)",
          }}
        >
          💡 Your action was not applied. You can reload to see the current state and
          decide whether to act on the updated document.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onDiscard}>
            Discard My Action
          </button>
          <button className="btn btn-primary" onClick={onReload}>
            Reload Document
          </button>
        </div>
      </div>
    </div>
  );
}
