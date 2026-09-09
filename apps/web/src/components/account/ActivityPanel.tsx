"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, uniqueByGiftId, type ApiGift } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth";
import { userFacingError } from "@/lib/errors";

type ActivityItem = ApiGift & { direction: "incoming" | "sent" };

export function ActivityPanel() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const data = await apiFetch<{ incoming: ApiGift[]; sent: ApiGift[] }>(
          "/v1/activity",
          { token },
        );
        setItems(uniqueByGiftId([
          ...data.incoming.map((gift) => ({ ...gift, direction: "incoming" as const })),
          ...data.sent.map((gift) => ({ ...gift, direction: "sent" as const })),
        ]).sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "")));
      } catch (error) {
        setItems([]);
        toast.error(userFacingError(error, "Could not load activity"), { id: "activity-load" });
      }
    })();
  }, []);

  return (
    <section className="radius-surface overflow-hidden border border-border/80 bg-card shadow-card">
      <div className="border-b border-brand-muted/70 bg-brand-mist px-5 py-4 sm:px-6">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Concise sent/received history. Full detail lives in Inbox.
        </p>
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet.{" "}
            <Link href="/inbox" className="font-semibold text-brand underline">
              Open Inbox
            </Link>
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="radius-surface-inner border border-border/70 px-4 py-3 text-sm"
            >
              <p className="font-medium capitalize">{item.direction} stock gift</p>
              <p className="text-xs text-muted-foreground">
                {item.state} · {item.createdAt ? new Date(item.createdAt).toLocaleString() : item.id}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
