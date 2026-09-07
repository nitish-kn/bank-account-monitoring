import React, { useEffect, useMemo, useState } from "react";
import { CalendarX2, Loader2, User } from "lucide-react";
import { accountsApi } from "../api/accounts";
import { formatDate, formatINR } from "../lib/helper";
import { EmptyMails } from "../utils/EmptyStates";

const DAY_MS = 24 * 60 * 60 * 1000;

// Vertical space between two consecutive dots scales with how far apart
// their dates actually are -- a one-month gap reads as a short hop, a
// six-month gap gets more room -- on a sqrt curve, clamped, so nothing
// collapses or runs away over a multi-year gap.
const connectorHeight = (fromDate, toDate) => {
  const days = Math.max(0, (new Date(toDate) - new Date(fromDate)) / DAY_MS);
  return Math.min(120, Math.max(28, 18 + Math.sqrt(days) * 5));
};

// Ring dots -- a soft tinted halo behind a white-filled, colored-border
// circle -- rather than a flat filled dot.
const DOT_RING = {
  green: { halo: "bg-emerald-500/15", ring: "border-emerald-500" },
  red: { halo: "bg-red-500/15", ring: "border-red-500" },
  today: { halo: "bg-transparent", ring: "border-gray-300" },
};

const GAP_CONNECTOR = {
  missing: "border-dashed border-red-300",
  pending: "border-dashed border-gray-300",
};

/** Turns the backend's covered/gap entries into one flat, ordered list of
 * dots -- a green dot where a statement's coverage starts, a red dot where
 * it ends, nothing in between (we only have the two boundary dates per
 * statement, not daily detail). The line connecting a start to its own end
 * dot is the covered stretch itself (green); the line leaving an end dot
 * carries whatever the gap after it actually is -- a real missing stretch
 * (red, dashed) or just "nothing uploaded since" (gray, dashed), which
 * also gets a terminal hollow dot for "today". */
const buildTimelinePoints = (entries) => {
  const points = [];

  entries.forEach((entry) => {
    if (entry.type === "covered") {
      points.push({
        key: `${entry.from}-start`,
        date: entry.from,
        dot: "green",
        kind: "start",
        closingBalance: entry.closing_balance,
      });
      points.push({ key: `${entry.from}-end`, date: entry.to, dot: "red", kind: "end", gapAfter: null });
    } else if (points.length) {
      // Attach this gap's status to the covered-end dot right before it --
      // that's the dot whose outgoing connector needs to render the gap.
      points[points.length - 1].gapAfter = entry.status;
      if (entry.status === "pending") {
        points.push({ key: `${entry.to}-today`, date: entry.to, dot: "today", kind: "today" });
      }
    }
  });

  return points;
};

/** Right-drawer content: the account's actual statement coverage, built
 * server-side from every bank_accounts row on file for it. Each statement
 * period is two dots -- green where it starts, red where it ends -- joined
 * by a green line; gaps between periods (or after the newest one) render
 * as a dashed line, red for a confirmed hole, gray for "just not synced
 * yet", ending in a hollow dot for today. */
const TimelineView = ({ account }) => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!account?.account_number) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    accountsApi
      .getStatementTimeline(account.account_number)
      .then((res) => {
        if (!cancelled) setEntries(res?.timeline || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || err?.message || "Failed to load the statement timeline.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [account?.account_number]);

  const points = useMemo(() => buildTimelinePoints(entries), [entries]);

  if (!account) return null;

  return (
    <div className="px-4 py-4">
      <div className="mb-5 flex flex-col gap-1 pl-3 border-b border-gray-100 pb-3">
          <p className="truncate text-base font-bold text-gray-900">{account.account_holder_name || "-"}</p>
          <p className="text-xs font-medium text-gray-500">A/C {account.account_number || "-"}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading timeline...
        </div>
      ) : error ? (
        <EmptyMails
          icon={<CalendarX2 className="h-10 w-10 text-gray-400" />}
          heading="Couldn't load the timeline"
          description={error}
        />
      ) : !points.length ? (
        <EmptyMails
          icon={<CalendarX2 className="h-10 w-10 text-gray-400" />}
          heading="No statement period on file"
          description="Upload a statement for this account to start building its coverage timeline."
        />
      ) : (
        <ol className="relative pl-8">
          {points.map((point, index) => {
            const isLast = index === points.length - 1;
            const next = points[index + 1];
            const height = next ? connectorHeight(point.date, next.date) : 0;
            const ring = DOT_RING[point.dot];

            const connectorClass =
              point.kind === "start" ? "border-emerald-400" : GAP_CONNECTOR[point.gapAfter] || "border-gray-200";

            return (
              <li key={point.key} className="relative px-1" style={{ paddingBottom: isLast ? 0 : height }}>
                {!isLast && <span className={`absolute -left-5 top-2.75 bottom-0 border-l-2 ${connectorClass}`} />}
                <span
                  className={`absolute -left-7.75 top-0 z-10 flex h-5.5 w-5.5 items-center justify-center rounded-full ${ring.halo}`}
                >
                  <span className={`h-3 w-3 rounded-full border-[3px] bg-white ${ring.ring}`} />
                </span>

                {point.kind === "today" ? (
                  <p className="pt-1 text-xs font-medium text-gray-400">Today</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-800">{formatDate(point.date)}</p>
                    {point.kind === "start" ? (
                      <>
                        <p className="text-xs text-gray-500">
                          Closing Balance{" "}
                          <span className="font-semibold text-sm text-gray-800">
                            {point.closingBalance != null ? formatINR(point.closingBalance) : "—"}
                          </span>
                        </p>
                        <p className="text-xs font-medium text-gray-400">File not available</p>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        Coverage ends here
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default TimelineView;
