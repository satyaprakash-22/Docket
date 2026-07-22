"use client";

import { DocStatus } from "@prisma/client";
import { WORKFLOW_STEPS } from "@/lib/workflow";

interface StatusStepperProps {
  currentStatus: DocStatus;
  isRejected?: boolean;
  isArchived?: boolean;
}

const STATUS_LABELS: Record<DocStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "In Review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

const STEP_ICONS: Record<string, string> = {
  DRAFT: "✏️",
  SUBMITTED: "👁",
  APPROVED: "✓",
  PUBLISHED: "🌐",
};

export function StatusStepper({
  currentStatus,
  isRejected,
  isArchived,
}: StatusStepperProps) {
  const currentIndex = WORKFLOW_STEPS.indexOf(currentStatus);

  if (isArchived) {
    return (
      <div className="stepper">
        <div className="stepper-step">
          <div className="stepper-circle" style={{ background: "var(--color-archived-bg)", borderColor: "var(--color-archived-border)", color: "var(--color-archived-text)" }}>
            📁
          </div>
          <span className="stepper-label" style={{ color: "var(--color-archived-text)" }}>
            Archived
          </span>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="stepper" style={{ gap: "8px" }}>
        <div className="stepper-step">
          <div className="stepper-circle completed">✓</div>
          <span className="stepper-label completed">Draft</span>
        </div>
        <div className="stepper-connector completed" />
        <div className="stepper-step">
          <div className="stepper-circle completed">✓</div>
          <span className="stepper-label completed">In Review</span>
        </div>
        <div className="stepper-connector" style={{ background: "var(--color-rejected-border)" }} />
        <div className="stepper-step">
          <div
            className="stepper-circle"
            style={{
              background: "var(--color-rejected-bg)",
              borderColor: "var(--color-rejected-border)",
              color: "var(--color-rejected-text)",
            }}
          >
            ✕
          </div>
          <span
            className="stepper-label"
            style={{ color: "var(--color-rejected-text)", fontWeight: 600 }}
          >
            Rejected
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="stepper">
      {WORKFLOW_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={step} style={{ display: "flex", alignItems: "center" }}>
            {index > 0 && (
              <div
                className={`stepper-connector ${isCompleted || isCurrent ? "completed" : ""}`}
                style={isCurrent ? { background: "var(--color-accent)" } : {}}
              />
            )}
            <div className="stepper-step">
              <div
                className={`stepper-circle ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""}`}
              >
                {isCompleted ? "✓" : STEP_ICONS[step] || index + 1}
              </div>
              <span
                className={`stepper-label ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""}`}
                style={isFuture ? { opacity: 0.5 } : {}}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
