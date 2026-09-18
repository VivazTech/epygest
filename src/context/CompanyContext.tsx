import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  COMPANY_HEADER,
  COMPANY_STORAGE_KEY,
  COMPANIES,
  DEFAULT_COMPANY_KEY,
  getCompany,
  isCompanyKey,
  type CompanyKey,
  type CompanyProfile,
} from '../lib/companies';

type CompanyContextValue = {
  companyKey: CompanyKey;
  company: CompanyProfile;
  companies: CompanyProfile[];
  setCompanyKey: (key: CompanyKey) => void;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

/** Fonte síncrona do header — evita race do useEffect com fetch das páginas. */
let activeEmpresaKey: CompanyKey = DEFAULT_COMPANY_KEY;

const readStoredCompanyKey = (): CompanyKey => {
  try {
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY);
    if (isCompanyKey(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_COMPANY_KEY;
};

if (typeof window !== 'undefined') {
  activeEmpresaKey = readStoredCompanyKey();
}

export const getActiveEmpresaKey = (): CompanyKey => activeEmpresaKey;

const persistEmpresaKey = (key: CompanyKey) => {
  activeEmpresaKey = key;
  try {
    localStorage.setItem(COMPANY_STORAGE_KEY, key);
  } catch {
    // ignore
  }
};

let fetchPatched = false;

/** Garante que todo fetch /api envie a empresa ativa (síncrono). */
const ensureCompanyFetchPatch = () => {
  if (fetchPatched || typeof window === 'undefined') return;
  fetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const isApi = url.startsWith('/api') || url.includes('/api/');
    if (!isApi) return original(input, init);

    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
    headers.set(COMPANY_HEADER, getActiveEmpresaKey());
    return original(input, { ...init, headers });
  };
};

// Instala o patch assim que o módulo carrega (antes de qualquer página buscar dados)
ensureCompanyFetchPatch();

export const CompanyProvider: React.FC<{
  children: React.ReactNode;
  /** Empresas liberadas para o usuário logado (de /api/auth/me). */
  allowedKeys?: CompanyKey[] | null;
}> = ({ children, allowedKeys }) => {
  const allowed = useMemo(() => {
    const keys = (allowedKeys || []).filter(isCompanyKey);
    return Array.from(new Set<CompanyKey>([...keys, 'vivaz', 'aqua']));
  }, [allowedKeys]);

  const [companyKey, setCompanyKeyState] = useState<CompanyKey>(() => {
    const stored = readStoredCompanyKey();
    persistEmpresaKey(stored);
    return stored;
  });

  useEffect(() => {
    if (!allowed.includes(companyKey)) {
      const next = allowed[0] || DEFAULT_COMPANY_KEY;
      persistEmpresaKey(next);
      setCompanyKeyState(next);
    }
  }, [allowed, companyKey]);

  const setCompanyKey = useCallback(
    (key: CompanyKey) => {
      if (!allowed.includes(key)) return;
      persistEmpresaKey(key);
      setCompanyKeyState(key);
    },
    [allowed]
  );

  const companies = useMemo(
    () => COMPANIES.filter((c) => allowed.includes(c.key)),
    [allowed]
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companyKey,
      company: getCompany(companyKey),
      companies,
      setCompanyKey,
    }),
    [companyKey, companies, setCompanyKey]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
};

export const useCompany = () => {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany deve ser usado dentro de CompanyProvider');
  return ctx;
};
