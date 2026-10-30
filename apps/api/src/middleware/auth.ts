import type { PrismaClient } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import { AppError } from "../lib/errors";
import { hashSessionToken } from "../lib/ids";

export const SESSION_COOKIE = "rd_session";

export interface AuthContext {
  merchantId: string;
  via: "session";
  /** Session row id (hash). */
  sessionId?: string;
  /** False while a session's merchant has not confirmed their email. */
  emailVerified: boolean;
}

const unauthenticated = () => new AppError("UNAUTHENTICATED", "Authentication required");

async function fromSession(prisma: PrismaClient, token: string): Promise<AuthContext | null> {
  if (token.length > 128) return null;
  const id = hashSessionToken(token);
  const row = await prisma.session.findUnique({ where: { id }, include: { merchant: { select: { emailVerifiedAt: true } } } });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id } }).catch(() => undefined);
    return null;
  }
  // Throttled: one write per session every five minutes at most.
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.updateMany({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return { merchantId: row.merchantId, via: "session", sessionId: id, emailVerified: row.merchant.emailVerifiedAt !== null };
}

function sessionToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const token = cookies?.[SESSION_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** The rd_session cookie; nothing else authenticates (Randi v1 has no API keys). */
export function requireSession(prisma: PrismaClient): RequestHandler {
  return async (req, _res, next) => {
    const token = sessionToken(req);
    const auth = token ? await fromSession(prisma, token) : null;
    if (!auth) throw unauthenticated();
    req.auth = auth;
    next();
  };
}

/** The dashboard and API stay locked until the email is confirmed. /auth routes are not behind this. */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (req.auth && !req.auth.emailVerified) {
    return next(new AppError("EMAIL_NOT_VERIFIED", "Confirm your email to continue"));
  }
  next();
};

export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}
