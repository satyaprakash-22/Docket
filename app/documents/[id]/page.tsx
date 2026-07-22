import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { NavBar } from "@/components/NavBar";
import { DocumentDetailClient } from "./DocumentDetailClient";

export default async function DocumentDetailPage({
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
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  if (!document) {
    notFound();
  }

  // Permission check — if not visible, return 404 (don't reveal existence)
  if (
    !can(
      { id: session.userId, role: session.role },
      "view",
      { status: document.status, authorId: document.authorId }
    )
  ) {
    notFound();
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: { documentId: id },
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <NavBar user={{ name: session.name, email: session.email, role: session.role }} />

      <main className="page-container">
        <DocumentDetailClient
          document={document}
          auditEvents={auditEvents}
          user={{
            id: session.userId,
            name: session.name,
            email: session.email,
            role: session.role,
          }}
        />
      </main>
    </div>
  );
}
