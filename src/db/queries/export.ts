/**
 * Server only. Everything BeamX holds about one user, for "Download my data" (spec 0017,
 * AC-7): one batched read, one round trip, every statement filtered by the session user,
 * so another user's rows can never appear. `export-shape.ts` turns the rows into the file.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../client";
import {
  businessProfile,
  consultation,
  conversation,
  creditAccount,
  creditHold,
  creditLedger,
  message,
  payment,
  policyAcceptance,
  report,
  toolRun,
  toolRunAnswer,
  user,
} from "../schema";

const statements = (userId: string) =>
  [
    db
      .select({
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        isAnonymous: user.isAnonymous,
      })
      .from(user)
      .where(eq(user.id, userId)),
    db
      .select({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
      })
      .from(conversation)
      .where(eq(conversation.userId, userId))
      .orderBy(asc(conversation.createdAt)),
    db
      .select({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        parts: message.parts,
        createdAt: message.createdAt,
      })
      .from(message)
      .innerJoin(conversation, eq(conversation.id, message.conversationId))
      .where(eq(conversation.userId, userId))
      .orderBy(asc(message.seq)),
    db
      .select({
        id: toolRun.id,
        conversationId: toolRun.conversationId,
        toolId: toolRun.toolId,
        toolVersion: toolRun.toolVersion,
        status: toolRun.status,
        scores: toolRun.scores,
        createdAt: toolRun.createdAt,
        completedAt: toolRun.completedAt,
      })
      .from(toolRun)
      .where(eq(toolRun.userId, userId))
      .orderBy(asc(toolRun.createdAt)),
    db
      .select({
        runId: toolRunAnswer.runId,
        questionId: toolRunAnswer.questionId,
        value: toolRunAnswer.value,
        source: toolRunAnswer.source,
        updatedAt: toolRunAnswer.updatedAt,
      })
      .from(toolRunAnswer)
      .innerJoin(toolRun, eq(toolRun.id, toolRunAnswer.runId))
      .where(eq(toolRun.userId, userId))
      .orderBy(asc(toolRunAnswer.createdAt)),
    db
      .select({
        runId: report.runId,
        status: report.status,
        content: report.content,
        generatedAt: report.generatedAt,
      })
      .from(report)
      .innerJoin(toolRun, eq(toolRun.id, report.runId))
      .where(eq(toolRun.userId, userId)),
    db
      .select({
        facts: businessProfile.facts,
        updatedAt: businessProfile.updatedAt,
      })
      .from(businessProfile)
      .where(eq(businessProfile.userId, userId)),
    db
      .select({
        balance: creditAccount.balance,
        held: creditAccount.held,
        lastActivityAt: creditAccount.lastActivityAt,
      })
      .from(creditAccount)
      .where(eq(creditAccount.userId, userId)),
    db
      .select({
        kind: creditLedger.kind,
        amount: creditLedger.amount,
        balanceAfter: creditLedger.balanceAfter,
        runId: creditLedger.runId,
        reason: creditLedger.reason,
        createdAt: creditLedger.createdAt,
      })
      .from(creditLedger)
      .where(eq(creditLedger.userId, userId))
      .orderBy(asc(creditLedger.createdAt)),
    db
      .select({
        purpose: creditHold.purpose,
        runId: creditHold.runId,
        amount: creditHold.amount,
        status: creditHold.status,
        chargedAmount: creditHold.chargedAmount,
        createdAt: creditHold.createdAt,
        settledAt: creditHold.settledAt,
      })
      .from(creditHold)
      .where(eq(creditHold.userId, userId))
      .orderBy(asc(creditHold.createdAt)),
    // No card data: BeamX never sees it, and the Paystack reference stays out too.
    db
      .select({
        credits: payment.credits,
        amountKobo: payment.amountKobo,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
      })
      .from(payment)
      .where(eq(payment.userId, userId))
      .orderBy(asc(payment.createdAt)),
    db
      .select({
        conversationId: consultation.conversationId,
        status: consultation.status,
        startTime: consultation.startTime,
        createdAt: consultation.createdAt,
        bookedAt: consultation.bookedAt,
        canceledAt: consultation.canceledAt,
      })
      .from(consultation)
      .where(eq(consultation.userId, userId))
      .orderBy(asc(consultation.createdAt)),
    db
      .select({
        policy: policyAcceptance.policy,
        version: policyAcceptance.version,
        acceptedAt: policyAcceptance.acceptedAt,
      })
      .from(policyAcceptance)
      .where(eq(policyAcceptance.userId, userId))
      .orderBy(asc(policyAcceptance.acceptedAt)),
  ] as const;

type Rows<T> = T extends PromiseLike<infer R> ? R : never;
type Statements = ReturnType<typeof statements>;

export type ExportRows = {
  readonly user: Rows<Statements[0]>;
  readonly conversations: Rows<Statements[1]>;
  readonly messages: Rows<Statements[2]>;
  readonly runs: Rows<Statements[3]>;
  readonly answers: Rows<Statements[4]>;
  readonly reports: Rows<Statements[5]>;
  readonly profile: Rows<Statements[6]>;
  readonly creditAccount: Rows<Statements[7]>;
  readonly ledger: Rows<Statements[8]>;
  readonly holds: Rows<Statements[9]>;
  readonly payments: Rows<Statements[10]>;
  readonly consultations: Rows<Statements[11]>;
  readonly policies: Rows<Statements[12]>;
};

/** Every row the user owns, in one round trip. */
export const readAll = async (userId: string): Promise<ExportRows> => {
  const [
    userRows,
    conversations,
    messages,
    runs,
    answers,
    reports,
    profile,
    account,
    ledger,
    holds,
    payments,
    consultations,
    policies,
  ] = await db.batch(statements(userId));
  return {
    user: userRows,
    conversations,
    messages,
    runs,
    answers,
    reports,
    profile,
    creditAccount: account,
    ledger,
    holds,
    payments,
    consultations,
    policies,
  };
};
