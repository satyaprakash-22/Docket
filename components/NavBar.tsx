"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";

interface NavBarProps {
  user: {
    name: string;
    email: string;
    role: Role;
  };
}

const ROLE_LABELS: Record<Role, string> = {
  VIEWER: "Viewer",
  AUTHOR: "Author",
  REVIEWER: "Reviewer",
  ADMIN: "Admin",
};

export function NavBar({ user }: NavBarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <nav className="nav">
      <Link href="/documents" className="nav-brand">
        	Doc<span>ket</span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            fontWeight: 400,
            marginLeft: "12px",
            letterSpacing: "0.04em",
          }}
        >
          Approvals
        </span>
      </Link>

      <div className="nav-right">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span className="role-badge">{ROLE_LABELS[user.role]}</span>
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--color-text-secondary)",
              fontWeight: 500,
            }}
          >
            {user.name}
          </span>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>
    </nav>
  );
}
