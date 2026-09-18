/** Empresas / unidades do sistema (tenant lógico). */

export type CompanyKey = 'vivaz' | 'aqua';

export type CompanyProfile = {
  key: CompanyKey;
  /** Nome curto no seletor */
  shortName: string;
  /** Título no Sidebar (Budget X) */
  budgetTitle: string;
  /** Subtítulo */
  subtitle: string;
  /** Cor principal da Sidebar */
  sidebarBg: string;
  /** Classes Tailwind do item ativo no menu */
  navActiveClass: string;
};

export const COMPANIES: CompanyProfile[] = [
  {
    key: 'vivaz',
    shortName: 'Vivaz Cataratas',
    budgetTitle: 'Budget Vivaz',
    subtitle: 'Vivaz Cataratas',
    sidebarBg: '#0077a8',
    navActiveClass: 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20',
  },
  {
    key: 'aqua',
    shortName: 'Aquamania',
    budgetTitle: 'Budget Aqua',
    subtitle: 'Aquamania',
    sidebarBg: '#C2410C',
    navActiveClass: 'bg-orange-500 text-white shadow-lg shadow-orange-950/30',
  },
];

export const DEFAULT_COMPANY_KEY: CompanyKey = 'vivaz';
export const COMPANY_STORAGE_KEY = 'app:empresaKey';
export const COMPANY_HEADER = 'X-Empresa-Key';

export const isCompanyKey = (value: unknown): value is CompanyKey =>
  value === 'vivaz' || value === 'aqua';

export const getCompany = (key?: string | null): CompanyProfile =>
  COMPANIES.find((c) => c.key === key) || COMPANIES[0];

export const resolveCompanyKey = (raw?: string | null): CompanyKey => {
  const n = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (n === 'aqua' || n.includes('aquamania')) return 'aqua';
  if (n === 'vivaz' || n.includes('vivaz')) return 'vivaz';
  return DEFAULT_COMPANY_KEY;
};
