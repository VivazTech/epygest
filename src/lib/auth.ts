import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/** Role é o slug em `app_roles` (sistema ou customizado). */
export type UserRole = string;

/** Roles de sistema legados (fallback quando a API de roles ainda não carregou). */
export const USER_ROLES: UserRole[] = [
  "admin",
  "finance",
  "controle",
  "manager",
  "viewer",
  "diretoria",
];

export interface SessionUser {
  id: number | string;
  email: string;
  role: UserRole;
  name?: string;
}

// Estende o Request do Express para carregar o usuário autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_COOKIE = "epygest_session";
const BCRYPT_ROUNDS = 12;
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET ausente ou muito curto. Defina um segredo forte (>= 32 chars) na variável de ambiente JWT_SECRET."
    );
  }
  return secret;
};

// ---------- Senhas ----------

// Detecta se a string já é um hash bcrypt ($2a$/$2b$/$2y$).
export const isBcryptHash = (value: string): boolean => /^\$2[aby]\$\d{2}\$/.test(value || "");

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, stored: string): Promise<boolean> => {
  if (!stored) return Promise.resolve(false);
  // Hash bcrypt -> comparação segura.
  if (isBcryptHash(stored)) return bcrypt.compare(plain, stored);
  // Senha legada em texto puro -> comparação direta (migrada no login).
  return Promise.resolve(plain === stored);
};

// Política mínima de senha. Retorna mensagem de erro ou null se válida.
export const validatePasswordStrength = (password: string): string | null => {
  if (typeof password !== "string" || password.length < 10) {
    return "A senha deve ter pelo menos 10 caracteres.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "A senha deve conter letras e números.";
  }
  return null;
};

// ---------- Sessão (JWT) ----------

export const signSession = (user: SessionUser): string =>
  jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, name: user.name },
    getJwtSecret(),
    { expiresIn: SESSION_TTL_SECONDS }
  );

export const verifySession = (token: string): SessionUser | null => {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as any;
    if (!payload?.sub || !payload?.role) return null;
    return {
      id: payload.sub,
      email: String(payload.email || ""),
      role: payload.role as UserRole,
      name: payload.name,
    };
  } catch {
    return null;
  }
};

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_TTL_SECONDS * 1000,
  path: "/",
});

// ---------- Middlewares ----------

// Exige um token de sessão válido. Popula req.user.
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const user = token ? verifySession(token) : null;
  if (!user) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  req.user = user;
  next();
};

// Exige que o usuário autenticado tenha um dos perfis informados.
export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    next();
  };
