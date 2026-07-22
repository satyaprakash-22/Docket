import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { NavBar } from "@/components/NavBar";
import { DocumentForm } from "@/components/DocumentForm";
import { Role } from "@prisma/client";

export default async function NewDocumentPage() {
  const session = await getSession();

  if (!session.userId) {
    redirect("/login");
  }

  if (session.role !== Role.AUTHOR) {
    redirect("/documents");
  }

  return (
    <div>
      <NavBar user={{ name: session.name, email: session.email, role: session.role }} />

      <main className="page-container" style={{ maxWidth: "720px" }}>
        <div className="page-header">
          <h1 className="page-title">Create New Draft</h1>
          <p className="page-subtitle">
            Draft a new controlled document. Once created, it can be edited before submitting for review.
          </p>
        </div>

        <div className="card">
          <DocumentForm mode="create" />
        </div>
      </main>
    </div>
  );
}
