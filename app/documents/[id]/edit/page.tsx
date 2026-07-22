import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { NavBar } from "@/components/NavBar";
import { DocumentForm } from "@/components/DocumentForm";

export default async function EditDocumentPage({
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
  });

  if (!document) {
    notFound();
  }

  if (
    !can(
      { id: session.userId, role: session.role },
      "edit",
      { status: document.status, authorId: document.authorId }
    )
  ) {
    redirect(`/documents/${id}`);
  }

  return (
    <div>
      <NavBar user={{ name: session.name, email: session.email, role: session.role }} />

      <main className="page-container" style={{ maxWidth: "720px" }}>
        <div className="page-header">
          <h1 className="page-title">Edit Document</h1>
          <p className="page-subtitle">
            Update document title or body before submitting for review. (Version v{document.version})
          </p>
        </div>

        <div className="card">
          <DocumentForm
            mode="edit"
            documentId={document.id}
            initialTitle={document.title}
            initialBody={document.body}
            expectedVersion={document.version}
          />
        </div>
      </main>
    </div>
  );
}
