import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AuditAction } from "@prisma/client";

export default async function ExportDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();

  if (!session.userId) {
    redirect("/login");
  }

  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, email: true } },
      auditEvents: {
        include: { actor: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!document) {
    notFound();
  }

  if (
    !can(
      { id: session.userId, role: session.role },
      "view",
      { status: document.status, authorId: document.authorId }
    )
  ) {
    notFound();
  }

  const approvalEvent = document.auditEvents.find(
    (e) => e.action === AuditAction.APPROVED
  );
  const publishEvent = document.auditEvents.find(
    (e) => e.action === AuditAction.PUBLISHED
  );

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "40px auto",
        padding: "32px",
        fontFamily: "var(--font-body)",
        color: "#111",
      }}
    >
      <div
        style={{
          borderBottom: "2px solid #111",
          paddingBottom: "16px",
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.75rem",
              marginBottom: "4px",
            }}
          >
            Controlled Document — Compliance Audit Report
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#555" }}>
            Generated on {new Date().toLocaleString("en-IN")} · Document ID: {document.id}
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={undefined}
          style={{ cursor: "pointer" }}
        >
          Print / Save PDF
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          background: "#f9f9f9",
          border: "1px solid #ddd",
          padding: "16px",
          borderRadius: "6px",
          marginBottom: "24px",
          fontSize: "0.875rem",
        }}
      >
        <div>
          <strong>Document Title:</strong> {document.title}
        </div>
        <div>
          <strong>Current Status:</strong> {document.status}
        </div>
        <div>
          <strong>Author:</strong> {document.author.name} ({document.author.email})
        </div>
        <div>
          <strong>Version Token:</strong> v{document.version}
        </div>
        <div>
          <strong>Approved By:</strong>{" "}
          {approvalEvent ? `${approvalEvent.actor.name} (${new Date(approvalEvent.createdAt).toLocaleDateString()})` : "Not Approved"}
        </div>
        <div>
          <strong>Published By:</strong>{" "}
          {publishEvent ? `${publishEvent.actor.name} (${new Date(publishEvent.createdAt).toLocaleDateString()})` : "Not Published"}
        </div>
      </div>

      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.25rem",
          marginBottom: "12px",
          borderBottom: "1px solid #ddd",
          paddingBottom: "8px",
        }}
      >
        Document Content
      </h2>
      <div
        style={{
          background: "#fff",
          border: "1px solid #eee",
          padding: "20px",
          borderRadius: "6px",
          marginBottom: "32px",
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
        }}
      >
        {document.body}
      </div>

      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.25rem",
          marginBottom: "12px",
          borderBottom: "1px solid #ddd",
          paddingBottom: "8px",
        }}
      >
        Immutable Audit Log
      </h2>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.8125rem",
        }}
      >
        <thead>
          <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
            <th style={{ padding: "8px 12px", border: "1px solid #ddd" }}>Timestamp</th>
            <th style={{ padding: "8px 12px", border: "1px solid #ddd" }}>Action</th>
            <th style={{ padding: "8px 12px", border: "1px solid #ddd" }}>Actor</th>
            <th style={{ padding: "8px 12px", border: "1px solid #ddd" }}>Role</th>
            <th style={{ padding: "8px 12px", border: "1px solid #ddd" }}>Transition</th>
            <th style={{ padding: "8px 12px", border: "1px solid #ddd" }}>Comment / Metadata</th>
          </tr>
        </thead>
        <tbody>
          {document.auditEvents.map((evt) => (
            <tr key={evt.id}>
              <td style={{ padding: "8px 12px", border: "1px solid #ddd" }}>
                {new Date(evt.createdAt).toLocaleString("en-IN")}
              </td>
              <td style={{ padding: "8px 12px", border: "1px solid #ddd", fontWeight: 600 }}>
                {evt.action}
              </td>
              <td style={{ padding: "8px 12px", border: "1px solid #ddd" }}>{evt.actor.name}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #ddd" }}>{evt.actor.role}</td>
              <td style={{ padding: "8px 12px", border: "1px solid #ddd" }}>
                {evt.fromStatus ? `${evt.fromStatus} → ${evt.toStatus}` : evt.toStatus ?? "—"}
              </td>
              <td style={{ padding: "8px 12px", border: "1px solid #ddd" }}>
                {evt.comment ? `"${evt.comment}"` : evt.metadata ? JSON.stringify(evt.metadata) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
