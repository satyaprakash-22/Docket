"use client";

import { AuditAction, AuditEvent, DocStatus, User } from "@prisma/client";

type AuditEventWithActor = AuditEvent & {
  actor: Pick<User, "id" | "name" | "email" | "role">;
};

interface AuditTimelineProps {
  events: AuditEventWithActor[];
}

const ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: "Document created",
  EDITED: "Document edited",
  SUBMITTED: "Submitted for review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REOPENED: "Reopened to draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const ACTION_ICONS: Record<AuditAction, string> = {
  CREATED: "✏️",
  EDITED: "📝",
  SUBMITTED: "📨",
  APPROVED: "✅",
  REJECTED: "❌",
  REOPENED: "🔄",
  PUBLISHED: "🌐",
  ARCHIVED: "📁",
};

const ACTION_COLORS: Record<AuditAction, string> = {
  CREATED: "var(--color-draft-bg)",
  EDITED: "var(--color-bg-alt)",
  SUBMITTED: "var(--color-submitted-bg)",
  APPROVED: "var(--color-approved-bg)",
  REJECTED: "var(--color-rejected-bg)",
  REOPENED: "var(--color-draft-bg)",
  PUBLISHED: "var(--color-published-bg)",
  ARCHIVED: "var(--color-archived-bg)",
};

const ACTION_BORDER: Record<AuditAction, string> = {
  CREATED: "var(--color-draft-border)",
  EDITED: "var(--color-border)",
  SUBMITTED: "var(--color-submitted-border)",
  APPROVED: "var(--color-approved-border)",
  REJECTED: "var(--color-rejected-border)",
  REOPENED: "var(--color-draft-border)",
  PUBLISHED: "var(--color-published-border)",
  ARCHIVED: "var(--color-archived-border)",
};

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusTransition({
  from,
  to,
}: {
  from: DocStatus | null;
  to: DocStatus | null;
}) {
  if (!from && !to) return null;
  const formatStatus = (s: DocStatus | null) =>
    s ? s.charAt(0) + s.slice(1).toLowerCase() : "—";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "0.75rem",
        color: "var(--color-text-muted)",
      }}
    >
      {from && <span className={`status-badge status-${from}`}>{formatStatus(from)}</span>}
      {from && to && <span style={{ fontSize: "0.625rem" }}>→</span>}
      {to && <span className={`status-badge status-${to}`}>{formatStatus(to)}</span>}
    </span>
  );
}

interface EditMetadata {
  titleChanged?: boolean;
  bodyChanged?: boolean;
  titleBefore?: string;
  titleAfter?: string;
}

export function AuditTimeline({ events }: AuditTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "40px 24px" }}>
        <div className="empty-state-icon">📋</div>
        <p className="empty-state-text">No audit events yet.</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {events.map((event) => {
        const meta = event.metadata as EditMetadata | null;

        return (
          <div key={event.id} className="timeline-item">
            <div
              className="timeline-dot"
              style={{
                background: ACTION_COLORS[event.action],
                border: `2px solid ${ACTION_BORDER[event.action]}`,
              }}
            >
              {ACTION_ICONS[event.action]}
            </div>
            <div className="timeline-content">
              <div className="timeline-action">{ACTION_LABELS[event.action]}</div>
              <div className="timeline-meta">
                <strong>{event.actor.name}</strong>
                {" · "}
                {formatDate(event.createdAt)}
                {(event.fromStatus || event.toStatus) && (
                  <>
                    {" · "}
                    <StatusTransition from={event.fromStatus} to={event.toStatus} />
                  </>
                )}
              </div>

              {/* Rejection comment */}
              {event.comment && (
                <div className="timeline-comment">"{event.comment}"</div>
              )}

              {/* Edit diff (differentiator #5) */}
              {event.action === AuditAction.EDITED && meta && (
                <div className="timeline-diff">
                  {meta.titleChanged && (
                    <div>
                      <strong>Title changed:</strong>
                      <span
                        style={{
                          textDecoration: "line-through",
                          marginLeft: "8px",
                          opacity: 0.6,
                        }}
                      >
                        {meta.titleBefore}
                      </span>
                      <span style={{ marginLeft: "8px" }}>→</span>
                      <span style={{ marginLeft: "8px", fontWeight: 500 }}>
                        {meta.titleAfter}
                      </span>
                    </div>
                  )}
                  {meta.bodyChanged && !meta.titleChanged && (
                    <div>Body content was updated.</div>
                  )}
                  {meta.titleChanged && meta.bodyChanged && (
                    <div style={{ marginTop: "4px" }}>Body content was also updated.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
