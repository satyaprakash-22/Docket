"use client";

import { useEffect, useState } from "react";

interface Viewer {
  userId: string;
  user: { id: string; name: string; role: string };
  lastSeenAt: string;
}

interface PresenceIndicatorProps {
  documentId: string;
}

export function PresenceIndicator({ documentId }: PresenceIndicatorProps) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    // Ping presence immediately + every 5 seconds
    const pingPresence = async () => {
      try {
        await fetch(`/api/documents/${documentId}/presence`, {
          method: "POST",
        });
      } catch {
        // Silent — presence is best-effort
      }
    };

    // Fetch who else is viewing
    const fetchViewers = async () => {
      try {
        const res = await fetch(`/api/documents/${documentId}/presence`);
        if (res.ok) {
          const data = await res.json();
          setViewers(data.viewers ?? []);
        }
      } catch {
        // Silent — presence is best-effort
      }
    };

    pingPresence();
    fetchViewers();

    const pingInterval = setInterval(pingPresence, 5000);
    const fetchInterval = setInterval(fetchViewers, 5000);

    return () => {
      clearInterval(pingInterval);
      clearInterval(fetchInterval);
    };
  }, [documentId]);

  if (viewers.length === 0) return null;

  const names = viewers.map((v) => v.user?.name ?? "Someone").join(", ");
  const verb = viewers.length === 1 ? "is" : "are";

  return (
    <div className="presence-indicator">
      <div className="presence-dot" />
      <span>
        <strong>{names}</strong> {verb} also viewing this document
      </span>
    </div>
  );
}
