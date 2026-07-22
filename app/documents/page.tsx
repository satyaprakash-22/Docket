import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { NavBar } from "@/components/NavBar";
import { DocStatus, Role, Prisma } from "@prisma/client";

interface SearchParams {
  status?: string;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();

  if (!session.userId) {
    redirect("/login");
  }

  const params = await searchParams;
  const filterStatus = params.status as DocStatus | undefined;

  let whereClause: Prisma.DocumentWhereInput = {};

  if (session.role === Role.VIEWER) {
    whereClause = { status: DocStatus.PUBLISHED };
  } else if (session.role === Role.AUTHOR) {
    whereClause = {
      OR: [{ authorId: session.userId }, { status: DocStatus.PUBLISHED }],
    };
  } else if (session.role === Role.REVIEWER) {
    whereClause = {
      status: {
        in: [
          DocStatus.SUBMITTED,
          DocStatus.APPROVED,
          DocStatus.REJECTED,
          DocStatus.PUBLISHED,
        ],
      },
    };
  } else if (session.role === Role.ADMIN) {
    whereClause = {};
  }

  if (filterStatus && Object.values(DocStatus).includes(filterStatus)) {
    whereClause = {
      AND: [whereClause, { status: filterStatus }],
    };
  }

  const documents = await prisma.document.findMany({
    where: whereClause,
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const getTabs = () => {
    switch (session.role) {
      case Role.VIEWER:
        return [{ label: "Published Documents", status: undefined }];
      case Role.AUTHOR:
        return [
          { label: "All My & Published", status: undefined },
          { label: "Drafts", status: DocStatus.DRAFT },
          { label: "Submitted", status: DocStatus.SUBMITTED },
          { label: "Rejected", status: DocStatus.REJECTED },
          { label: "Published", status: DocStatus.PUBLISHED },
        ];
      case Role.REVIEWER:
        return [
          { label: "Needs Review", status: DocStatus.SUBMITTED },
          { label: "Approved", status: DocStatus.APPROVED },
          { label: "Published", status: DocStatus.PUBLISHED },
          { label: "All Visible", status: undefined },
        ];
      case Role.ADMIN:
        return [
          { label: "All", status: undefined },
          { label: "Drafts", status: DocStatus.DRAFT },
          { label: "Submitted", status: DocStatus.SUBMITTED },
          { label: "Approved", status: DocStatus.APPROVED },
          { label: "Published", status: DocStatus.PUBLISHED },
          { label: "Archived", status: DocStatus.ARCHIVED },
        ];
      default:
        return [];
    }
  };

  const tabs = getTabs();

  return (
    <div>
      <NavBar user={{ name: session.name, email: session.email, role: session.role }} />

      <main className="page-container">
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1 className="page-title">Controlled Documents</h1>
            <p className="page-subtitle">
              {session.role === Role.VIEWER && "Viewing published documentation."}
              {session.role === Role.AUTHOR && "Manage your authored documents and track approval progress."}
              {session.role === Role.REVIEWER && "Review submitted documents and publish approved releases."}
              {session.role === Role.ADMIN && "System-wide document overview and lifecycle management."}
            </p>
          </div>

          {session.role === Role.AUTHOR && (
            <Link href="/documents/new" className="btn btn-accent">
              <span>+</span> Create New Draft
            </Link>
          )}
        </div>

        {/* Filter Tabs */}
        {tabs.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "24px",
              borderBottom: "1px solid var(--color-border)",
              paddingBottom: "12px",
              overflowX: "auto",
            }}
          >
            {tabs.map((tab) => {
              const isActive = filterStatus === tab.status;
              const href = tab.status
                ? `/documents?status=${tab.status}`
                : "/documents";

              return (
                <Link
                  key={tab.label}
                  href={href}
                  className={`btn btn-sm ${isActive ? "btn-primary" : "btn-ghost"}`}
                  style={{
                    borderRadius: "100px",
                  }}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        )}

        {/* Document List */}
        {documents.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-state-icon">📄</div>
            <h3 className="empty-state-title">No documents found</h3>
            <p className="empty-state-text">
              {filterStatus
                ? `No documents in ${filterStatus} status.`
                : "There are currently no documents visible to your role."}
            </p>
            {session.role === Role.AUTHOR && (
              <Link href="/documents/new" className="btn btn-primary">
                Create First Draft
              </Link>
            )}
          </div>
        ) : (
          <div className="doc-list">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="doc-row"
              >
                <div>
                  <div className="doc-row-title">{doc.title}</div>
                  <div className="doc-row-meta">
                    <span>By {doc.author.name}</span>
                    <span className="meta-dot" />
                    <span>
                      Updated{" "}
                      {new Date(doc.updatedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span className="meta-dot" />
                    <span>v{doc.version}</span>
                  </div>
                </div>

                <div>
                  <span className={`status-badge status-${doc.status}`}>
                    {doc.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
