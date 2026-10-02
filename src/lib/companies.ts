/** Empresas / unidades do sistema (tenant lógico). */

export type CompanyKey = 'vivaz' | 'aqua';

export type CompanyTheme = {
  brand50: string;
  brand100: string;
  brand400: string;
  brand500: string;
  brand600: string;
  brand700: string;
  brand900: string;
  brandSoft: string;
  brandMuted: string;
  brandBorder: string;
  brandRing: string;
};

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
  /** Tokens de marca (botões, links, focos) */
  theme: CompanyTheme;
};

export const COMPANY_THEMES: Record<CompanyKey, CompanyTheme> = {
  vivaz: {
    brand50: '#eef7fc',
    brand100: '#d9eef8',
    brand400: '#1f8fbe',
    brand500: '#0077a8',
    brand600: '#006c98',
    brand700: '#005d84',
    brand900: '#003e59',
    brandSoft: 'rgb(0 119 168 / 0.05)',
    brandMuted: 'rgb(0 119 168 / 0.2)',
    brandBorder: '#9ecfe4',
    brandRing: 'rgb(0 119 168 / 0.2)',
  },
  aqua: {
    brand50: '#fff7ed',
    brand100: '#ffedd5',
    brand400: '#fb923c',
    brand500: '#ea580c',
    brand600: '#c2410c',
    brand700: '#9a3412',
    brand900: '#7c2d12',
    brandSoft: 'rgb(234 88 12 / 0.05)',
    brandMuted: 'rgb(234 88 12 / 0.2)',
    brandBorder: '#fdba74',
    brandRing: 'rgb(234 88 12 / 0.2)',
  },
};

export const COMPANIES: CompanyProfile[] = [
  {
    key: 'vivaz',
    shortName: 'Vivaz Cataratas',
    budgetTitle: 'Budget Vivaz',
    subtitle: 'Vivaz Cataratas',
    sidebarBg: '#0077a8',
    navActiveClass: 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20',
    theme: COMPANY_THEMES.vivaz,
  },
  {
    key: 'aqua',
    shortName: 'Aquamania',
    budgetTitle: 'Budget Aqua',
    subtitle: 'Aquamania',
    sidebarBg: '#C2410C',
    navActiveClass: 'bg-orange-500 text-white shadow-lg shadow-orange-950/30',
    theme: COMPANY_THEMES.aqua,
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

/** Aplica tokens CSS da empresa em todo o layout (botões, focos, accents). */
export const applyCompanyTheme = (key: CompanyKey) => {
  if (typeof document === 'undefined') return;
  const theme = COMPANY_THEMES[key] || COMPANY_THEMES.vivaz;
  const root = document.documentElement;
  root.dataset.empresa = key;
  root.style.setProperty('--brand-50', theme.brand50);
  root.style.setProperty('--brand-100', theme.brand100);
  root.style.setProperty('--brand-400', theme.brand400);
  root.style.setProperty('--brand-500', theme.brand500);
  root.style.setProperty('--brand-600', theme.brand600);
  root.style.setProperty('--brand-700', theme.brand700);
  root.style.setProperty('--brand-900', theme.brand900);
  root.style.setProperty('--brand-soft', theme.brandSoft);
  root.style.setProperty('--brand-muted', theme.brandMuted);
  root.style.setProperty('--brand-border', theme.brandBorder);
  root.style.setProperty('--brand-ring', theme.brandRing);
};
