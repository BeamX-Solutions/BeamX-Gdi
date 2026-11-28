/**
 * The "Download my data" file (spec 0017, AC-7), built from `export.readAll`'s rows.
 * Pure: messages nest under their chat, answers and the report under their run, and
 * money is shown in naira. Card data never exists here (BeamX never sees it).
 */
import type { ExportRows } from "./export";

export const EXPORT_FORMAT = "beamx-data-export/1";

/** `beamx-data-2026-11-28.json`, from a `YYYY-MM-DD` day. */
export const exportFileName = (day: string): string => `beamx-data-${day}.json`;

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value;

const groupBy = <T, K>(
  rows: readonly T[],
  key: (row: T) => K,
): ReadonlyMap<K, readonly T[]> => {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
};

export const toExport = (rows: ExportRows, exportedAt: Date) => {
  const messagesByChat = groupBy(rows.messages, (m) => m.conversationId);
  const answersByRun = groupBy(rows.answers, (a) => a.runId);
  const reportByRun = new Map(rows.reports.map((r) => [r.runId, r]));
  const person = rows.user[0];
  const guest = person?.isAnonymous === true;
  const profile = rows.profile[0];
  const account = rows.creditAccount[0];

  return {
    format: EXPORT_FORMAT,
    exportedAt: exportedAt.toISOString(),
    user:
      person === undefined
        ? null
        : {
            // A guest's email is a placeholder Better Auth made, not theirs.
            email: guest ? null : person.email,
            name: guest ? null : person.name,
            guest,
            createdAt: iso(person.createdAt),
          },
    conversations: rows.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      messages: (messagesByChat.get(c.id) ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts,
        createdAt: m.createdAt,
      })),
    })),
    runs: rows.runs.map((r) => {
      const found = reportByRun.get(r.id);
      return {
        id: r.id,
        conversationId: r.conversationId,
        tool: r.toolId,
        toolVersion: r.toolVersion,
        status: r.status,
        scores: r.scores,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        answers: (answersByRun.get(r.id) ?? []).map((a) => ({
          questionId: a.questionId,
          value: a.value,
          source: a.source,
          updatedAt: a.updatedAt,
        })),
        report:
          found === undefined
            ? null
            : {
                status: found.status,
                content: found.content,
                generatedAt: found.generatedAt,
              },
      };
    }),
    businessProfile:
      profile === undefined
        ? null
        : { facts: profile.facts, updatedAt: profile.updatedAt },
    credits: {
      balance: account?.balance ?? 0,
      held: account?.held ?? 0,
      lastActivityAt: account?.lastActivityAt ?? null,
      ledger: rows.ledger,
      holds: rows.holds,
    },
    payments: rows.payments.map((p) => ({
      credits: p.credits,
      amount: p.amountKobo / 100,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    })),
    consultations: rows.consultations,
    policyAcceptances: rows.policies,
  };
};

export type DataExport = ReturnType<typeof toExport>;
