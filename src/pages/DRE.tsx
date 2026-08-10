import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight, History, X } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { filterTreeByLabel } from '../lib/search';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import dreData from '../data/dre2026.json';

// Dados-base gerados da aba "Prev x Real 2026" (linhas 52-330) pelo script
// scripts/import-dre-prev-real.cjs. Ajustes manuais por célula ficam em
// dre_cell_edits / dre_cell_edit_history (Supabase) e sobrepõem o valor importado.

type MonthCell = {
  prev: number | null;
  real: number | null;
  dif: number | null;
};

interface DRERow {
  id: string;
  row: number;
  label: string;
  level: number;
  isHeader?: boolean;
  isTotal?: boolean;
  values: MonthCell[];
  children?: DRERow[];
}

type CellEdit = {
  row_key: number;
  month: number;
  field: 'prev' | 'real';
  value: number;
  previous_value?: number | null;
  motivo?: string | null;
  user_name: string | null;
  user_email?: string | null;
  updated_at: string;
};

type AjusteHistorico = {
  id: number;
  year: number;
  row_key: number;
  row_label: string | null;
  month: number;
  field: 'prev' | 'real';
  previous_value: number | null;
  new_value: number;
  motivo: string;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
};

type AdjustModal = {
  row: DRERow;
  monthIndex: number;
  field: 'prev' | 'real';
  currentValue: number | null;
};

type DreUser = { name?: string; email?: string; role?: string } | null;

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const dreRows = dreData.rows as DRERow[];
const dreYear = dreData.year;
const dreSource = dreData.source;

const editKey = (row: number, month: number, field: 'prev' | 'real') => `${row}:${month}:${field}`;

const RESULTADO_FOOTER_IDS = [
  { id: 'l52-receita-bruta', short: 'Receita Bruta', accent: 'emerald' as const },
  { id: 'l77-receita-liquida', short: 'Receita Líquida', accent: 'teal' as const },
  { id: 'l81-resultado-bruto', short: 'Resultado Bruto', accent: 'sky' as const },
  { id: 'l83-despesas-totais', short: 'Despesas Totais', accent: 'amber' as const },
  { id: 'l309-resultado-operacional', short: 'Resultado Operacional', accent: 'brand' as const },
  { id: 'resultado-liquido', short: 'Resultado Líquido', accent: 'brand' as const },
];

const LIQUIDO_LABEL = '(=) Resultado Líquido';

// Natureza por seção de topo do DRE. Linhas de despesa "estouram" quando o
// realizado ultrapassa o previsto (real > prev). Receitas/resultados são o
// contrário (quanto maior, melhor). Filhas herdam a natureza do grupo de topo.
const DESPESA_SECTIONS = new Set<string>([
  'l71-impostos-s-faturamento',
  'l79-cmv',
  'l83-despesas-totais',
  'l311-impostos-s-resultado',
  'l319-obras-e-investimentos',
]);
type DreKind = 'despesa' | 'receita';
const kindOfTop = (id: string): DreKind => (DESPESA_SECTIONS.has(id) ? 'despesa' : 'receita');
// Classe de cor da Diferença conforme a natureza (vermelho = desfavorável).
const difClass = (kind: DreKind, dif: number | null): string => {
  if (dif == null || dif === 0) return dif === 0 ? 'text-slate-500' : 'text-slate-400';
  const bad = kind === 'despesa' ? dif > 0 : dif < 0;
  return bad ? 'text-red-600' : 'text-emerald-600';
};
// Estouro = linha de despesa cujo realizado ultrapassa o previsto.
const isEstouro = (kind: DreKind, cell: MonthCell): boolean =>
  kind === 'despesa' && cell.real != null && cell.prev != null && cell.real > cell.prev;

/** Mapeamentos RDS → linhas do DRE (mesma regra do backend /api/dre/realizado-rds). */
const DRE_RDS_MAPPINGS = [
  {
    rowId: 'l54-diaria',
    sectionKey: 'hospedagem',
    labels: ['HOSPEDAGEM', 'HOSPEDAGEM NO-SHOW', 'UPGRADE / UPSELLING', 'TAXA DE SERVICO'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Hospedagem › Acumulado (R$) — HOSPEDAGEM + HOSPEDAGEM NO-SHOW + UPGRADE / UPSELLING + Taxa de serviço',
  },
  {
    rowId: 'l55-cafe-da-manha',
    sectionKey: 'alimentos_bebidas',
    labels: ['CAFE DA MANHA (PENSAO)'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › CAFE DA MANHA (PENSAO) › Acumulado (R$)',
  },
  {
    rowId: 'l56-map-e-fap',
    sectionKey: 'alimentos_bebidas',
    labels: ['ALMOCO (PENSAO)', 'JANTAR (PENSAO)'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › Acumulado (R$) — ALMOCO (PENSAO) + JANTAR (PENSAO)',
  },
  {
    rowId: 'l58-frigobar',
    sectionKey: 'alimentos_bebidas',
    labels: ['FRIGOBAR'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › FRIGOBAR › Acumulado (R$)',
  },
  {
    rowId: 'l59-room-service',
    sectionKey: 'alimentos_bebidas',
    labels: ['ROOM SERVICE'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › ROOM SERVICE › Acumulado (R$)',
  },
  {
    rowId: 'l60-bar-gaia',
    sectionKey: 'alimentos_bebidas',
    labels: ['BAR GAIA'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › BAR GAIA › Acumulado (R$)',
  },
  {
    rowId: 'l61-rest-allegro',
    sectionKey: 'alimentos_bebidas',
    labels: ['RESTAURANTE ALLEGRO'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › RESTAURANTE ALLEGRO › Acumulado (R$)',
  },
  {
    rowId: 'l62-rest-terraza',
    sectionKey: 'alimentos_bebidas',
    labels: ['RESTAURANTE TERRAZA'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › RESTAURANTE TERRAZA › Acumulado (R$)',
  },
  {
    rowId: 'l63-eventos-banquete',
    sectionKey: 'alimentos_bebidas',
    labels: ['EVENTOS/BANQUETES'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Alimentos & Bebidas › EVENTOS/BANQUETES › Acumulado (R$)',
  },
  {
    rowId: 'l66-estacionamento',
    sectionKey: 'diversos',
    labels: ['ESTACIONAMENTO'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Diversos › ESTACIONAMENTO › Acumulado (R$)',
  },
  {
    rowId: 'l67-outras',
    sectionKey: 'diversos',
    labels: [
      'TAXA DE TURISMO',
      'LAVANDERIA',
      'DAY PASS',
      'RECREACAO',
      'RECEPCAO DIVERSOS',
      'RECEPCAO SERVICOS',
      'TARIFADOR',
      'TAXA DE ISS',
    ],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Diversos › Acumulado (R$) — TAXA DE TURISMO + LAVANDERIA + DAY PASS + RECREACAO + RECEPCAO DIVERSOS + RECEPCAO SERVICOS + TARIFADOR + TAXA DE ISS',
  },
  {
    rowId: 'l68-aluguel-eventos',
    sectionKey: 'eventos',
    labels: ['EVENTOS - SERVICOS'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Eventos › EVENTOS - SERVICOS › Acumulado (R$)',
  },
  {
    rowId: 'l69-spa',
    sectionKey: 'diversos',
    labels: ['SPA'],
    source:
      'Apuração de Receita › Relatório Diário de Situação › Diversos › SPA › Acumulado (R$)',
  },
] as const;

/** Pais cujo Realizado é a soma explícita destes filhos (senão, soma todos os children da árvore). */
const DRE_RDS_ROLLUPS: Record<string, readonly string[]> = {
  'l53-receita-de-diarias': ['l54-diaria', 'l55-cafe-da-manha', 'l56-map-e-fap'],
  'l57-receita-de-a-b': [
    'l58-frigobar',
    'l59-room-service',
    'l60-bar-gaia',
    'l61-rest-allegro',
    'l62-rest-terraza',
    'l63-eventos-banquete',
    'l64-pizzaria',
  ],
  'l65-outras-receitas': ['l66-estacionamento', 'l67-outras', 'l68-aluguel-eventos', 'l69-spa'],
  'l52-receita-bruta': ['l53-receita-de-diarias', 'l57-receita-de-a-b', 'l65-outras-receitas'],
  'l71-impostos-s-faturamento': ['l72-iss', 'l73-icms', 'l74-pis', 'l75-cofins'],
};

/**
 * Impostos s/ Faturamento (ISS/ICMS/PIS/COFINS): sem apuração mensal no RDS.
 * Realizado provisório = Previsto × (Receita Bruta realizada ÷ Previsto).
 */
const DRE_PRO_RATA_BRUTA = new Set([
  'l72-iss',
  'l73-icms',
  'l74-pis',
  'l75-cofins',
]);

/** Linhas de resultado derivadas (minuendo − subtraendos). */
const DRE_DERIVED: Record<string, { partIds: readonly string[]; formula: string }> = {
  'l77-receita-liquida': {
    partIds: ['l52-receita-bruta', 'l71-impostos-s-faturamento'],
    formula: 'Receita Bruta − Impostos s/ Faturamento',
  },
  'l81-resultado-bruto': {
    partIds: ['l77-receita-liquida', 'l79-cmv'],
    formula: 'Receita Líquida − CMV',
  },
  'l309-resultado-operacional': {
    partIds: ['l81-resultado-bruto', 'l83-despesas-totais'],
    formula: 'Resultado Bruto − Despesas Totais',
  },
};

const subDerived = (values: Array<number | null>): number | null => {
  if (values.every((v) => v == null)) return null;
  return values.slice(1).reduce((acc, v) => acc - (v ?? 0), values[0] ?? 0);
};

const emptyRdsByRow = (): Record<string, Array<number | null>> =>
  Object.fromEntries(
    DRE_RDS_MAPPINGS.map((m) => [m.rowId, Array.from({ length: 12 }, () => null as number | null)])
  );

const findDreRow = (rows: DRERow[], id: string): DRERow | null => {
  for (const row of rows) {
    if (row.id === id) return row;
    if (row.children?.length) {
      const found = findDreRow(row.children, id);
      if (found) return found;
    }
  }
  return null;
};

/** Código contábil no final do label do DRE, ex.: "ENERGIA (367)" → "367". */
const extractCrdCode = (label: string): string | null => {
  const m = /\((\d+)\)\s*$/.exec(String(label || '').trim());
  return m ? m[1] : null;
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const DREPage: React.FC<{ user?: DreUser }> = ({ user = null }) => {
  const { query } = useSearch();
  const canAdjust = user?.role === 'admin' || user?.role === 'controle';
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const row of dreRows) {
      if (row.children?.length) initial[row.id] = true;
    }
    return initial;
  });
  const [edits, setEdits] = useState<Record<string, CellEdit>>({});
  const [editsError, setEditsError] = useState('');
  const [ajustes, setAjustes] = useState<AjusteHistorico[]>([]);
  const [ajustesError, setAjustesError] = useState('');
  const [rdsByRowId, setRdsByRowId] = useState<Record<string, Array<number | null>>>(emptyRdsByRow);
  const [rdsSources, setRdsSources] = useState<Record<string, string>>(() =>
    Object.fromEntries(DRE_RDS_MAPPINGS.map((m) => [m.rowId, m.source]))
  );
  const [rdsReportDates, setRdsReportDates] = useState<Array<string | null>>(
    () => Array.from({ length: 12 }, () => null)
  );
  /** Realizado Rel. CRD (SALDO LANÇ) por código contábil → 12 meses. */
  const [crdByCodigo, setCrdByCodigo] = useState<Record<string, Array<number | null>>>({});
  const [crdNomes, setCrdNomes] = useState<Record<string, string>>({});
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null);
  const [adjustValue, setAdjustValue] = useState('');
  const [adjustMotivo, setAdjustMotivo] = useState('');
  const [savingCell, setSavingCell] = useState(false);
  /** Índices 0–11 dos meses visíveis. Vazio = todos. Multi-seleção = período acumulado. */
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() =>
    Array.from({ length: 12 }, (_, i) => i)
  );
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  // Análises AV/AH (opcionais, como na versão anterior do DRE); preferência fica salva no navegador.
  const [showAV, setShowAV] = useState(() => {
    try { return localStorage.getItem('dre:show_av') === '1'; } catch { return false; }
  });
  const [showAH, setShowAH] = useState(() => {
    try { return localStorage.getItem('dre:show_ah') === '1'; } catch { return false; }
  });

  const toggleAV = () => {
    setShowAV((v) => {
      try { localStorage.setItem('dre:show_av', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };
  const toggleAH = () => {
    setShowAH((v) => {
      try { localStorage.setItem('dre:show_ah', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };

  const visibleMonths = useMemo(() => {
    const set = new Set(selectedMonths);
    const months = MESES.map((_, i) => i).filter((i) => set.has(i));
    return months.length ? months : MESES.map((_, i) => i);
  }, [selectedMonths]);

  const allMonthsSelected = visibleMonths.length === 12;

  /** Clique: alterna o mês (acumula). Shift+clique: seleciona a faixa até o último clicado. */
  const clickMonth = (monthIndex: number, shift: boolean) => {
    if (shift && lastClicked != null) {
      const [a, b] = [Math.min(lastClicked, monthIndex), Math.max(lastClicked, monthIndex)];
      setSelectedMonths(Array.from({ length: b - a + 1 }, (_, k) => a + k));
    } else {
      setSelectedMonths((prev) =>
        prev.includes(monthIndex) ? prev.filter((x) => x !== monthIndex) : [...prev, monthIndex].sort((x, y) => x - y)
      );
    }
    setLastClicked(monthIndex);
  };

  const selectAllMonths = () => { setSelectedMonths(Array.from({ length: 12 }, (_, i) => i)); setLastClicked(null); };

  const loadEdits = async () => {
    try {
      const res = await fetch(`/api/dre/edits?year=${dreYear}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar edições.');
      const map: Record<string, CellEdit> = {};
      for (const e of (json.edits ?? []) as CellEdit[]) {
        map[editKey(e.row_key, e.month, e.field)] = e;
      }
      setEdits(map);
      setEditsError('');
    } catch (err: any) {
      setEditsError(err?.message || 'Falha ao carregar edições manuais do DRE.');
    }
  };

  const loadAjustes = async () => {
    try {
      const res = await fetch(`/api/dre/ajustes?year=${dreYear}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar histórico de ajustes.');
      setAjustes(Array.isArray(json.ajustes) ? json.ajustes : []);
      setAjustesError('');
    } catch (err: any) {
      setAjustesError(err?.message || 'Falha ao carregar histórico de ajustes.');
    }
  };

  const loadRdsRealizado = async () => {
    const RDS_ACUMULADO_IDX = 2;
    const normalize = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ');

    const sumLabels = (sections: any[], sectionKey: string, labels: readonly string[]): number | null => {
      const section = (sections ?? []).find((s: any) => String(s?.key ?? '') === sectionKey);
      if (!section || !Array.isArray(section.items)) return null;
      const wanted = new Set(labels.map((l) => normalize(l)));
      let sum = 0;
      let matched = 0;
      for (const item of section.items) {
        if (!wanted.has(normalize(item?.label))) continue;
        sum += Number(Array.isArray(item?.values) ? item.values[RDS_ACUMULADO_IDX] : 0) || 0;
        matched += 1;
      }
      return matched > 0 ? sum : null;
    };

    const applyByRowId = (raw: Record<string, any>) => {
      const next = emptyRdsByRow();
      for (const mapping of DRE_RDS_MAPPINGS) {
        const arr = Array.isArray(raw[mapping.rowId]) ? raw[mapping.rowId] : [];
        next[mapping.rowId] = Array.from({ length: 12 }, (_, i) => {
          const v = arr[i];
          return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
        });
      }
      setRdsByRowId(next);
    };

    try {
      const dedicated = await fetch(`/api/dre/realizado-rds?year=${dreYear}`);
      if (dedicated.ok) {
        const json = await dedicated.json().catch(() => ({}));
        const dates = Array.isArray(json.reportDates) ? json.reportDates : [];
        setRdsReportDates(Array.from({ length: 12 }, (_, i) => dates[i] ?? null));
        if (json.sources && typeof json.sources === 'object') {
          setRdsSources((prev) => ({ ...prev, ...json.sources }));
        }
        if (json.byRowId && typeof json.byRowId === 'object') {
          applyByRowId(json.byRowId);
          return;
        }
        // API antiga (só Diária): completa o restante via snapshots mensais abaixo.
      }

      const compRes = await fetch(`/api/rds/competencias?year=${dreYear}`);
      const compJson = await compRes.json().catch(() => ({}));
      if (!compRes.ok) {
        console.warn('DRE RDS competências:', compJson.error || compRes.status);
        return;
      }
      const imported = (Array.isArray(compJson.months) ? compJson.months : []).filter(
        (m: any) => m?.importado
      );
      const next = emptyRdsByRow();
      const dates: Array<string | null> = Array.from({ length: 12 }, () => null);

      await Promise.all(
        imported.map(async (m: any) => {
          const month = Number(m.month);
          if (!month || month < 1 || month > 12) return;
          const res = await fetch(`/api/rds?year=${dreYear}&month=${month}`);
          const json = await res.json().catch(() => ({}));
          if (!res.ok) return;
          const sections = json.sections ?? [];
          dates[month - 1] = json.report_date ?? m.report_date ?? null;
          for (const mapping of DRE_RDS_MAPPINGS) {
            next[mapping.rowId][month - 1] = sumLabels(sections, mapping.sectionKey, mapping.labels);
          }
        })
      );

      setRdsByRowId(next);
      setRdsReportDates(dates);
    } catch (err) {
      console.warn('DRE realizado RDS falhou:', err);
    }
  };

  const loadCrdRealizado = async () => {
    try {
      const res = await fetch(`/api/dre/realizado-crd?year=${dreYear}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('DRE realizado CRD:', json.error || res.status);
        return;
      }
      const raw = json.byCodigo && typeof json.byCodigo === 'object' ? json.byCodigo : {};
      const next: Record<string, Array<number | null>> = {};
      for (const [codigo, arr] of Object.entries(raw)) {
        const list = Array.isArray(arr) ? arr : [];
        next[codigo] = Array.from({ length: 12 }, (_, i) => {
          const v = list[i];
          return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
        });
      }
      setCrdByCodigo(next);
      setCrdNomes(json.nomes && typeof json.nomes === 'object' ? json.nomes : {});
    } catch (err) {
      console.warn('DRE realizado CRD falhou:', err);
    }
  };

  useEffect(() => {
    loadEdits();
    loadAjustes();
    loadRdsRealizado();
    loadCrdRealizado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredDreRows = useMemo(() => filterTreeByLabel(dreRows, query), [query]);

  useEffect(() => {
    if (!query.trim()) return;
    const next: Record<string, boolean> = {};
    const collect = (rows: DRERow[]) => {
      for (const row of rows) {
        if (row.children?.length) next[row.id] = true;
        if (row.children) collect(row.children);
      }
    };
    collect(filteredDreRows);
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [query, filteredDreRows]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Valor efetivo da célula: edição manual > rollup de filhos > RDS mapeado > planilha.
  const rollupChildIds = (row: DRERow): string[] | null => {
    if (DRE_RDS_ROLLUPS[row.id]) return [...DRE_RDS_ROLLUPS[row.id]];
    if (row.children?.length) return row.children.map((c) => c.id);
    return null;
  };

  const effective = (row: DRERow, monthIndex: number): MonthCell => {
    const base = row.values[monthIndex];
    const prevEdit = edits[editKey(row.row, monthIndex + 1, 'prev')];
    const realEdit = edits[editKey(row.row, monthIndex + 1, 'real')];
    const prevFromEditOrBase = prevEdit ? prevEdit.value : base.prev;

    if (realEdit) {
      const real = realEdit.value;
      const dif = prevFromEditOrBase != null && real != null ? real - prevFromEditOrBase : null;
      return { prev: prevFromEditOrBase, real, dif };
    }

    // Impostos s/ Faturamento: escala o previsto pela execução da Receita Bruta.
    if (DRE_PRO_RATA_BRUTA.has(row.id)) {
      const prev = prevFromEditOrBase;
      const bruta = findDreRow(dreRows, 'l52-receita-bruta');
      const brutaCell = bruta ? effective(bruta, monthIndex) : null;
      if (
        prev != null &&
        brutaCell?.real != null &&
        brutaCell.prev != null &&
        brutaCell.prev !== 0
      ) {
        const real = prev * (brutaCell.real / brutaCell.prev);
        const dif = real - prev;
        return { prev, real, dif };
      }
    }

    const derived = DRE_DERIVED[row.id];
    if (derived) {
      const parts = derived.partIds.map((id) => {
        const part = findDreRow(dreRows, id);
        return part ? effective(part, monthIndex) : { prev: null, real: null, dif: null };
      });
      const prev = prevEdit ? prevEdit.value : (subDerived(parts.map((p) => p.prev)) ?? base.prev);
      const real = subDerived(parts.map((p) => p.real));
      const dif = prev != null && real != null ? real - prev : null;
      return { prev, real, dif };
    }

    const prev = prevFromEditOrBase;
    const childIds = rollupChildIds(row);
    if (childIds?.length) {
      let sumReal = 0;
      let anyReal = false;
      let sumDif = 0;
      let anyDif = false;
      for (const childId of childIds) {
        const child = findDreRow(dreRows, childId);
        if (!child) continue;
        const childCell = effective(child, monthIndex);
        if (childCell.real != null) {
          sumReal += childCell.real;
          anyReal = true;
        }
        if (childCell.dif != null) {
          sumDif += childCell.dif;
          anyDif = true;
        }
      }
      if (anyReal || anyDif) {
        const real = anyReal ? sumReal : null;
        // Diferença do pai = soma das diferenças dos filhos (equivalente a real−prev quando os previstos batem).
        const dif = anyDif ? sumDif : real != null && prev != null ? real - prev : null;
        return { prev, real, dif };
      }
    }

    const rdsValue = rdsByRowId[row.id]?.[monthIndex] ?? null;
    const rdsReal = rdsValue != null && Number.isFinite(rdsValue) ? rdsValue : null;
    const crdCode = extractCrdCode(row.label);
    const crdValue = crdCode ? crdByCodigo[crdCode]?.[monthIndex] ?? null : null;
    const crdReal = crdValue != null && Number.isFinite(crdValue) ? crdValue : null;
    // Rel. CRD (despesas) tem prioridade sobre RDS (receitas) na mesma linha — raramente coincidem.
    const real = crdReal != null ? crdReal : rdsReal != null ? rdsReal : base.real;
    const fromAuto = crdReal != null || rdsReal != null;
    const dif = prevEdit || fromAuto
      ? (prev != null && real != null ? real - prev : null)
      : base.dif;
    return { prev, real, dif };
  };

  const isAutoDerivedReal = (row: DRERow, monthIndex: number): boolean => {
    if (edits[editKey(row.row, monthIndex + 1, 'real')]) return false;
    const crdCode = extractCrdCode(row.label);
    if (crdCode && crdByCodigo[crdCode]?.[monthIndex] != null) return true;
    if (rdsByRowId[row.id]?.[monthIndex] != null) return true;
    if (DRE_PRO_RATA_BRUTA.has(row.id)) {
      const bruta = findDreRow(dreRows, 'l52-receita-bruta');
      return bruta ? isAutoDerivedReal(bruta, monthIndex) : false;
    }
    const derived = DRE_DERIVED[row.id];
    if (derived) {
      return derived.partIds.some((partId) => {
        const part = findDreRow(dreRows, partId);
        return part ? isAutoDerivedReal(part, monthIndex) : false;
      });
    }
    const childIds = rollupChildIds(row);
    if (!childIds?.length) return false;
    // Pai com rollup: destaca se algum filho tem Realizado (CRD, RDS ou edição).
    return childIds.some((childId) => {
      const child = findDreRow(dreRows, childId);
      if (!child) return false;
      return effective(child, monthIndex).real != null;
    });
  };

  const rollupPartsLabel = (row: DRERow): string => {
    const derived = DRE_DERIVED[row.id];
    if (derived) return derived.formula;
    const childIds = rollupChildIds(row);
    if (!childIds?.length) return 'filhos';
    const names = childIds
      .map((id) => findDreRow(dreRows, id)?.label)
      .filter(Boolean) as string[];
    return names.length ? names.join(' + ') : 'filhos';
  };

  const totalOf = (row: DRERow, monthIndexes: number[] = visibleMonths): MonthCell => {
    let prev: number | null = null;
    let real: number | null = null;
    let dif: number | null = null;
    for (const m of monthIndexes) {
      const v = effective(row, m);
      if (v.prev != null) prev = (prev ?? 0) + v.prev;
      if (v.real != null) real = (real ?? 0) + v.real;
      // Soma as diferenças mês a mês (só entra mês com Realizado e Previsto).
      if (v.dif != null) dif = (dif ?? 0) + v.dif;
    }
    if (dif == null && prev != null && real != null) dif = real - prev;
    return { prev, real, dif };
  };

  // Resultado Líquido = Resultado Operacional − Impostos s/ Resultado − Obras e Investimentos
  const resultadoOperacionalRow = useMemo(() => findDreRow(dreRows, 'l309-resultado-operacional'), []);
  const impostosResultadoRow = useMemo(() => findDreRow(dreRows, 'l311-impostos-s-resultado'), []);
  const obrasInvestimentosRow = useMemo(() => findDreRow(dreRows, 'l319-obras-e-investimentos'), []);

  const resultadoLiquidoOf = (monthIndex: number): MonthCell => {
    if (!resultadoOperacionalRow || !impostosResultadoRow || !obrasInvestimentosRow) {
      return { prev: null, real: null, dif: null };
    }
    const op = effective(resultadoOperacionalRow, monthIndex);
    const imp = effective(impostosResultadoRow, monthIndex);
    const obr = effective(obrasInvestimentosRow, monthIndex);
    const fieldOrNull = (a: number | null, b: number | null, c: number | null) => {
      if (a == null && b == null && c == null) return null;
      return (a ?? 0) - (b ?? 0) - (c ?? 0);
    };
    const prev = fieldOrNull(op.prev, imp.prev, obr.prev);
    const real = fieldOrNull(op.real, imp.real, obr.real);
    const dif = prev != null && real != null ? real - prev : null;
    return { prev, real, dif };
  };

  const resultadoLiquidoTotal = (monthIndexes: number[] = visibleMonths): MonthCell => {
    let prev: number | null = null;
    let real: number | null = null;
    let dif: number | null = null;
    for (const m of monthIndexes) {
      const v = resultadoLiquidoOf(m);
      if (v.prev != null) prev = (prev ?? 0) + v.prev;
      if (v.real != null) real = (real ?? 0) + v.real;
      if (v.dif != null) dif = (dif ?? 0) + v.dif;
    }
    if (dif == null && prev != null && real != null) dif = real - prev;
    return { prev, real, dif };
  };

  const showResultadoLiquido = Boolean(
    resultadoOperacionalRow && impostosResultadoRow && obrasInvestimentosRow
  );

  // ---- Análises AV/AH (sobre os dados importados + edições) ----
  type Analise = { pct: number | null; serie: 'Realizado' | 'Previsto' | null };

  // AV: |linha| ÷ |Receita Líquida do mês| × 100 (Realizado quando ambos têm; senão Previsto).
  // AV: quanto do Previsto a Diferença representa. O Previsto é o 100%
  // (ex.: previsto R$ 1.000 e realizado R$ 400 → diferença R$ 600 = 60%).
  const avFromCell = (cell: MonthCell): number | null => {
    if (cell.prev == null || cell.prev === 0 || cell.dif == null) return null;
    return (Math.abs(cell.dif) / Math.abs(cell.prev)) * 100;
  };

  const avOf = (row: DRERow, monthIndex: number): number | null =>
    avFromCell(effective(row, monthIndex));

  const avTotalOf = (row: DRERow): number | null => avFromCell(totalOf(row));

  // AH: variação % sobre o mês-calendário anterior (Realizado quando ambos têm; senão Previsto).
  const ahOf = (row: DRERow, monthIndex: number): Analise => {
    if (monthIndex === 0) return { pct: null, serie: null };
    const cur = effective(row, monthIndex);
    const ant = effective(row, monthIndex - 1);
    if (cur.real != null && ant.real != null && ant.real !== 0) {
      return { pct: ((cur.real - ant.real) / Math.abs(ant.real)) * 100, serie: 'Realizado' };
    }
    if (cur.prev != null && ant.prev != null && ant.prev !== 0) {
      return { pct: ((cur.prev - ant.prev) / Math.abs(ant.prev)) * 100, serie: 'Previsto' };
    }
    return { pct: null, serie: null };
  };

  // ---- Linhas de resultado: AV/AH com regra própria ----
  // AV = participação sobre uma base (a base é 100%); AH = |Diferença| ÷ |Previsto|.
  const receitaBrutaRow = useMemo(() => findDreRow(dreRows, 'l52-receita-bruta'), []);
  const receitaLiquidaRow = useMemo(() => findDreRow(dreRows, 'l77-receita-liquida'), []);

  // Base da AV de cada linha de resultado (por id da linha).
  const avBaseInfo = (rowId: string): { row: DRERow | null; label: string } | null => {
    switch (rowId) {
      case 'l77-receita-liquida': // Receita Líquida ÷ Receita Bruta
      case 'l309-resultado-operacional': // Resultado Operacional ÷ Receita Bruta
      case 'resultado-liquido': // Resultado Líquido ÷ Receita Bruta
        return { row: receitaBrutaRow, label: '(+) RECEITA BRUTA' };
      case 'l81-resultado-bruto': // Resultado Bruto ÷ Receita Líquida
        return { row: receitaLiquidaRow, label: '(=) RECEITA LÍQUIDA' };
      default:
        return null;
    }
  };

  // Razão |linha| ÷ |base| (Realizado quando ambos têm; senão Previsto).
  const ratioFromCells = (line: MonthCell, base: MonthCell): number | null => {
    if (line.real != null && base.real != null && base.real !== 0) {
      return (Math.abs(line.real) / Math.abs(base.real)) * 100;
    }
    if (line.prev != null && base.prev != null && base.prev !== 0) {
      return (Math.abs(line.prev) / Math.abs(base.prev)) * 100;
    }
    return null;
  };

  const monthColSpan = 3 + (showAV ? 1 : 0) + (showAH ? 1 : 0);

  const openAdjustModal = (row: DRERow, monthIndex: number, field: 'prev' | 'real') => {
    if (!canAdjust) return;
    const current = effective(row, monthIndex)[field];
    setAdjustModal({ row, monthIndex, field, currentValue: current });
    setAdjustValue(current == null ? '' : String(current));
    setAdjustMotivo('');
  };

  const closeAdjustModal = () => {
    setAdjustModal(null);
    setAdjustValue('');
    setAdjustMotivo('');
  };

  const saveAdjustModal = async () => {
    if (savingCell || !adjustModal) return;
    const motivo = adjustMotivo.trim();
    if (!motivo) {
      alert('Informe o motivo do ajuste.');
      return;
    }
    const raw = adjustValue.trim();
    if (!raw) {
      alert('Informe o novo valor.');
      return;
    }
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    const parsedSimple = Number(raw.replace(',', '.'));
    const value = Number.isFinite(parsedSimple) ? parsedSimple : parsed;
    if (!Number.isFinite(value)) {
      alert('Digite um valor numérico válido.');
      return;
    }
    setSavingCell(true);
    try {
      const res = await fetch('/api/dre/cell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: dreYear,
          row_key: adjustModal.row.row,
          row_label: adjustModal.row.label,
          month: adjustModal.monthIndex + 1,
          field: adjustModal.field,
          value,
          previous_value: adjustModal.currentValue,
          motivo,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao registrar o ajuste.');
        return;
      }
      const saved = json.edit as CellEdit;
      setEdits((prev) => ({ ...prev, [editKey(saved.row_key, saved.month, saved.field)]: saved }));
      await loadAjustes();
      setAdjustModal(null);
      setAdjustValue('');
      setAdjustMotivo('');
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado ao salvar.');
    } finally {
      setSavingCell(false);
    }
  };

  const resultadosFooter = useMemo(() => {
    return RESULTADO_FOOTER_IDS.map((meta) => {
      const isLiquido = meta.id === 'resultado-liquido';
      const row = isLiquido ? null : findDreRow(dreRows, meta.id);
      if (!isLiquido && !row) return null;
      if (isLiquido && !showResultadoLiquido) return null;
      const total = isLiquido ? resultadoLiquidoTotal(visibleMonths) : totalOf(row!, visibleMonths);
      const atingimento =
        total.prev != null && total.prev !== 0 && total.real != null
          ? (total.real / total.prev) * 100
          : null;
      return { ...meta, row, total, atingimento };
    }).filter(Boolean) as Array<{
      id: string;
      short: string;
      accent: 'emerald' | 'teal' | 'sky' | 'amber' | 'brand';
      row: DRERow | null;
      total: MonthCell;
      atingimento: number | null;
    }>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, visibleMonths, showResultadoLiquido, rdsByRowId, crdByCodigo]);

  const resultadoOperacional = resultadosFooter.find((r) => r.id === 'l309-resultado-operacional');
  const resultadoLiquidoFooter = resultadosFooter.find((r) => r.id === 'resultado-liquido');

  const renderEditableCell = (row: DRERow, monthIndex: number, field: 'prev' | 'real') => {
    const cell = effective(row, monthIndex);
    const value = cell[field];
    const campo = field === 'prev' ? 'Previsto' : 'Realizado';
    const mes = `${MESES[monthIndex]}/${dreYear}`;
    const edit = edits[editKey(row.row, monthIndex + 1, field)];
    const base = row.values[monthIndex][field];
    const fromAuto = field === 'real' && isAutoDerivedReal(row, monthIndex);
    const crdCode = extractCrdCode(row.label);
    const fromCrd =
      field === 'real' &&
      !edit &&
      Boolean(crdCode) &&
      crdByCodigo[crdCode!]?.[monthIndex] != null;
    const fromRds =
      field === 'real' &&
      !edit &&
      !fromCrd &&
      fromAuto &&
      (rdsByRowId[row.id]?.[monthIndex] != null ||
        Boolean(DRE_DERIVED[row.id]) ||
        Boolean(rollupChildIds(row)?.length) ||
        DRE_PRO_RATA_BRUTA.has(row.id));
    const derived = DRE_DERIVED[row.id];
    const isProRata = field === 'real' && !edit && DRE_PRO_RATA_BRUTA.has(row.id) && fromAuto;
    const isRollup =
      field === 'real' &&
      !edit &&
      Boolean(rollupChildIds(row)?.length) &&
      fromAuto &&
      !fromCrd;
    const isDerivedReal = field === 'real' && !edit && Boolean(derived) && fromAuto;
    const previousDisplay =
      edit?.previous_value != null
        ? formatCurrency(edit.previous_value)
        : base == null
          ? '—'
          : formatCurrency(base);
    const meta = edit
      ? edit.motivo
        ? valueTrace.dre.adjusted(
            row.label,
            campo,
            mes,
            edit.user_name || 'usuário não identificado',
            formatWhen(edit.updated_at),
            previousDisplay,
            formatCurrency(edit.value),
            edit.motivo
          )
        : valueTrace.dre.edited(
            row.label,
            campo,
            mes,
            edit.user_name || 'usuário não identificado',
            formatWhen(edit.updated_at),
            previousDisplay
          )
      : isProRata
        ? valueTrace.dre.proRataBruta(row.label, mes)
        : isDerivedReal
          ? valueTrace.dre.derived(row.label, mes, derived!.formula)
          : isRollup
            ? valueTrace.dre.rdsRollup(row.label, mes, rollupPartsLabel(row))
            : fromCrd
              ? valueTrace.dre.crdMapped(
                  row.label,
                  mes,
                  crdCode!,
                  crdNomes[crdCode!] ?? null
                )
              : fromRds
                ? valueTrace.dre.rdsMapped(
                    row.label,
                    mes,
                    rdsSources[row.id] || 'Relatório Diário de Situação',
                    rdsReportDates[monthIndex]
                  )
                : valueTrace.dre.imported(row.label, row.row, campo, mes, dreSource);

    return (
      <button
        type="button"
        onClick={() => openAdjustModal(row, monthIndex, field)}
        disabled={!canAdjust}
        className={cn(
          'px-1 py-0.5 rounded transition-colors',
          canAdjust ? 'hover:bg-emerald-50' : 'cursor-default',
          edit && 'bg-amber-50/70',
          (fromRds || fromCrd) && !edit && 'bg-sky-50/80'
        )}
        title={canAdjust ? 'Clique para ajustar' : 'Somente visualização'}
      >
        <ValueTrace
          className={cn(
            'text-xs tabular-nums',
            field === 'real' && 'font-medium',
            value != null && value < 0 ? 'text-red-600' : field === 'real' ? 'text-slate-800' : 'text-slate-600'
          )}
          displayValue={value == null ? '—' : formatCurrency(value)}
          meta={meta}
        />
      </button>
    );
  };

  const renderRow = (row: DRERow, kind: DreKind = 'receita'): React.ReactNode => {
    const hasChildren = Boolean(row.children?.length);
    const isExpanded = expanded[row.id];
    const total = totalOf(row);
    const rowEstouro = isEstouro(kind, total); // despesa estourada no período

    return (
      <React.Fragment key={row.id}>
        <tr
          className={cn(
            'transition-colors',
            row.isTotal ? 'bg-slate-100/80 font-bold' : 'hover:bg-slate-50',
            row.isHeader ? 'font-semibold text-slate-800' : 'text-slate-600',
            rowEstouro && !row.isTotal && 'bg-red-50/70'
          )}
        >
          <td className={cn(
            'sticky left-0 z-20 border-r border-slate-200 px-4 py-2.5 min-w-[320px] max-w-[320px]',
            rowEstouro ? 'bg-red-50 border-l-2 border-l-red-400' : 'bg-white'
          )}>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${row.level * 16}px` }}>
              {hasChildren ? (
                <button onClick={() => toggleExpand(row.id)} className="rounded p-0.5 hover:bg-slate-100">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span className="text-sm">{row.label}</span>
            </div>
          </td>

          {visibleMonths.map((monthIndex) => {
            const cell = effective(row, monthIndex);
            const mes = `${MESES[monthIndex]}/${dreYear}`;
            const resInfo = avBaseInfo(row.id);
            // AV: linha de resultado → participação sobre a base; demais → |Dif| ÷ |Previsto|.
            const avPct = !showAV
              ? null
              : resInfo?.row
                ? ratioFromCells(cell, effective(resInfo.row, monthIndex))
                : avOf(row, monthIndex);
            const avMeta = resInfo?.row
              ? valueTrace.dre.avRatio(row.label, mes, resInfo.label)
              : valueTrace.dre.av(row.label, mes);
            // AH: linha de resultado → |Dif| ÷ |Previsto|; demais → variação vs mês anterior.
            const ahMoM = showAH && !resInfo ? ahOf(row, monthIndex) : null;
            const ahPct = !showAH ? null : resInfo ? avFromCell(cell) : ahMoM?.pct ?? null;
            const ahSigned = !resInfo; // variação mensal tem sinal; variância (Dif÷Prev) é magnitude
            return (
              <React.Fragment key={`${row.id}-${monthIndex}`}>
                <td className="min-w-[120px] px-2 py-1.5 text-right">
                  {renderEditableCell(row, monthIndex, 'prev')}
                </td>
                <td className="min-w-[120px] px-2 py-1.5 text-right">
                  {renderEditableCell(row, monthIndex, 'real')}
                </td>
                <td className={cn('min-w-[120px] px-3 py-1.5 text-right', isEstouro(kind, cell) && 'bg-red-50', !showAV && !showAH && 'border-r border-slate-200')}>
                  <ValueTrace
                    className={cn('text-xs tabular-nums font-semibold', difClass(kind, cell.dif))}
                    displayValue={cell.dif == null ? '—' : formatCurrency(cell.dif)}
                    meta={
                      rollupChildIds(row)?.length
                        ? valueTrace.dre.diferencaRollup(row.label, mes, rollupPartsLabel(row))
                        : valueTrace.dre.diferenca(row.label, mes)
                    }
                  />
                </td>
                {showAV && (
                  <td className={cn('min-w-[70px] px-2 py-1.5 text-right', !showAH && 'border-r border-slate-200')}>
                    <ValueTrace
                      className="text-[11px] tabular-nums font-semibold text-slate-500"
                      displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                      meta={avMeta}
                    />
                  </td>
                )}
                {showAH && (
                  <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200">
                    <ValueTrace
                      className={cn(
                        'text-[11px] tabular-nums font-semibold',
                        ahPct == null
                          ? 'text-slate-400'
                          : ahSigned
                            ? (ahPct < 0 ? 'text-red-600' : ahPct > 0 ? 'text-emerald-600' : 'text-slate-500')
                            : 'text-slate-500'
                      )}
                      displayValue={ahPct == null ? '—' : `${ahSigned && ahPct > 0 ? '+' : ''}${ahPct.toFixed(1)}%`}
                      meta={
                        resInfo
                          ? valueTrace.dre.ahVariance(row.label, mes)
                          : valueTrace.dre.ah(
                              row.label,
                              mes,
                              monthIndex > 0 ? `${MESES[monthIndex - 1]}/${dreYear}` : 'mês anterior',
                              ahMoM?.serie ?? 'Previsto'
                            )
                      }
                    />
                  </td>
                )}
              </React.Fragment>
            );
          })}

          <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
            <ValueTrace
              className={cn('text-xs tabular-nums', total.prev != null && total.prev < 0 ? 'text-red-600' : 'text-slate-600')}
              displayValue={total.prev == null ? '—' : formatCurrency(total.prev)}
              meta={valueTrace.dre.total(row.label, 'Previsto')}
            />
          </td>
          <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
            <ValueTrace
              className={cn('text-xs tabular-nums font-medium', total.real != null && total.real < 0 ? 'text-red-600' : 'text-slate-800')}
              displayValue={total.real == null ? '—' : formatCurrency(total.real)}
              meta={valueTrace.dre.total(row.label, 'Realizado')}
            />
          </td>
          <td className={cn('min-w-[120px] px-3 py-1.5 text-right', rowEstouro ? 'bg-red-50' : 'bg-slate-50/60', !showAV && !showAH && 'border-r border-slate-200')}>
            <ValueTrace
              className={cn('text-xs tabular-nums font-semibold', difClass(kind, total.dif))}
              displayValue={total.dif == null ? '—' : formatCurrency(total.dif)}
              meta={valueTrace.dre.total(row.label, 'Diferença')}
            />
          </td>
          {showAV && (() => {
            const resInfo = avBaseInfo(row.id);
            const avPct = resInfo?.row ? ratioFromCells(total, totalOf(resInfo.row)) : avTotalOf(row);
            const avMeta = resInfo?.row
              ? valueTrace.dre.avRatio(row.label, `Total ${dreYear}`, resInfo.label)
              : valueTrace.dre.av(row.label, `Total ${dreYear}`);
            return (
              <td className={cn('min-w-[70px] px-2 py-1.5 text-right bg-slate-50/60', !showAH && 'border-r border-slate-200')}>
                <ValueTrace
                  className="text-[11px] tabular-nums font-semibold text-slate-500"
                  displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                  meta={avMeta}
                />
              </td>
            );
          })()}
          {showAH && (() => {
            // Linha de resultado: AH do total = |Dif| ÷ |Previsto| acumulado. Demais: sem AH no total.
            const isResult = avBaseInfo(row.id) !== null;
            const ahPct = isResult ? avFromCell(total) : null;
            return (
              <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200 bg-slate-50/60">
                {ahPct == null ? (
                  <span className="text-[11px] text-slate-300">—</span>
                ) : (
                  <ValueTrace
                    className="text-[11px] tabular-nums font-semibold text-slate-500"
                    displayValue={`${ahPct.toFixed(1)}%`}
                    meta={valueTrace.dre.ahVariance(row.label, `Total ${dreYear}`)}
                  />
                )}
              </td>
            );
          })()}
        </tr>
        {hasChildren && isExpanded && row.children?.map((child) => renderRow(child, kind))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">DRE Gerencial</h2>
          <p className="text-sm text-slate-500">
            Previsto da planilha Prev x Real {dreYear}. Realizado de Diárias/A&B pelo RDS; despesas com código (ex.: ENERGIA (367)) pelo Rel. CRD (SALDO LANÇ). Clique em Previsto/Realizado para abrir o ajuste (com motivo); passe o mouse para ver a origem do valor.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm shrink-0">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">{dreYear}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Filtrar meses
            {!allMonthsSelected && (
              <span className="ml-2 normal-case tracking-normal text-slate-500 font-semibold">
                · {visibleMonths.length} selecionado{visibleMonths.length === 1 ? '' : 's'}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            {!allMonthsSelected && (
              <button
                type="button"
                onClick={selectAllMonths}
                className="text-xs font-bold text-[#004D40] hover:underline"
              >
                Mostrar todos
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Análises</span>
              <button
                type="button"
                onClick={toggleAV}
                title="Análise vertical: quanto do Previsto a Diferença representa (Previsto = 100%)"
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border',
                  showAV
                    ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                )}
              >
                AV
              </button>
              <button
                type="button"
                onClick={toggleAH}
                title="Análise horizontal: variação % de cada linha sobre o mês anterior"
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border',
                  showAH
                    ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                )}
              >
                AH
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MESES.map((mes, monthIndex) => {
            const active = visibleMonths.includes(monthIndex);
            return (
              <button
                key={mes}
                type="button"
                onClick={(e) => clickMonth(monthIndex, e.shiftKey)}
                title="Clique para incluir/excluir · Shift+clique para faixa (ex.: Jan→Abr) · Mostrar todos para o ano"
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                  active
                    ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                )}
              >
                {mes.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>

      {editsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {editsError} Os valores exibidos são os importados da planilha; edições manuais ficarão disponíveis após resolver o aviso.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 border-b border-slate-200">
                <th rowSpan={2} className="sticky left-0 z-30 min-w-[320px] max-w-[320px] border-r border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Categorias
                </th>
                {visibleMonths.map((monthIndex) => (
                  <th key={MESES[monthIndex]} colSpan={monthColSpan} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {MESES[monthIndex]} {dreYear}
                  </th>
                ))}
                <th colSpan={monthColSpan} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-200/70">
                  {allMonthsSelected ? `Total ${dreYear}` : `Total (${visibleMonths.length} mês${visibleMonths.length === 1 ? '' : 'es'})`}
                </th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                {[...visibleMonths.map((i) => MESES[i]), 'Total'].map((mes) => (
                  <React.Fragment key={`${mes}-sub`}>
                    <th className="min-w-[120px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Previsto</th>
                    <th className="min-w-[120px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Realizado</th>
                    <th className={cn('min-w-[120px] px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500', showAV || showAH ? 'border-r border-slate-100' : 'border-r border-slate-200')}>Diferença</th>
                    {showAV && (
                      <th className={cn('min-w-[70px] px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500', showAH ? 'border-r border-slate-100' : 'border-r border-slate-200')} title="Análise vertical: quanto do Previsto a Diferença representa (Previsto = 100%)">AV</th>
                    )}
                    {showAH && (
                      <th className="min-w-[70px] border-r border-slate-200 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Análise horizontal: variação % sobre o mês anterior">AH</th>
                    )}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDreRows.map((row) => renderRow(row, kindOfTop(row.id)))}
              {showResultadoLiquido && (() => {
                const total = resultadoLiquidoTotal();
                // Resultado Líquido é linha de resultado: AV = ÷ Receita Bruta; AH = |Dif| ÷ |Previsto|.
                return (
                  <tr key="resultado-liquido" className="bg-slate-100/80 font-bold text-slate-800">
                    <td className="sticky left-0 z-20 bg-slate-100 border-r border-slate-200 min-w-[320px] max-w-[320px] px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5" />
                        <span className="text-sm">{LIQUIDO_LABEL}</span>
                      </div>
                    </td>
                    {visibleMonths.map((monthIndex) => {
                      const cell = resultadoLiquidoOf(monthIndex);
                      const mes = `${MESES[monthIndex]}/${dreYear}`;
                      const avPct = showAV && receitaBrutaRow
                        ? ratioFromCells(cell, effective(receitaBrutaRow, monthIndex))
                        : null;
                      const ahPct = showAH ? avFromCell(cell) : null;
                      return (
                        <React.Fragment key={`liquido-${monthIndex}`}>
                          <td className="min-w-[120px] px-3 py-1.5 text-right">
                            <ValueTrace
                              className={cn(
                                'text-xs tabular-nums',
                                cell.prev != null && cell.prev < 0 ? 'text-red-600' : 'text-slate-600'
                              )}
                              displayValue={cell.prev == null ? '—' : formatCurrency(cell.prev)}
                              meta={valueTrace.dre.liquido('Previsto', mes)}
                            />
                          </td>
                          <td className="min-w-[120px] px-3 py-1.5 text-right">
                            <ValueTrace
                              className={cn(
                                'text-xs tabular-nums font-medium',
                                cell.real != null && cell.real < 0 ? 'text-red-600' : 'text-slate-800'
                              )}
                              displayValue={cell.real == null ? '—' : formatCurrency(cell.real)}
                              meta={valueTrace.dre.liquido('Realizado', mes)}
                            />
                          </td>
                          <td className={cn('min-w-[120px] px-3 py-1.5 text-right', !showAV && !showAH && 'border-r border-slate-200')}>
                            <ValueTrace
                              className={cn(
                                'text-xs tabular-nums font-semibold',
                                cell.dif == null ? 'text-slate-400' : cell.dif < 0 ? 'text-red-600' : cell.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
                              )}
                              displayValue={cell.dif == null ? '—' : formatCurrency(cell.dif)}
                              meta={valueTrace.dre.liquido('Diferença', mes)}
                            />
                          </td>
                          {showAV && (
                            <td className={cn('min-w-[70px] px-2 py-1.5 text-right', !showAH && 'border-r border-slate-200')}>
                              <ValueTrace
                                className="text-[11px] tabular-nums font-semibold text-slate-500"
                                displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                                meta={valueTrace.dre.avRatio(LIQUIDO_LABEL, mes, '(+) RECEITA BRUTA')}
                              />
                            </td>
                          )}
                          {showAH && (
                            <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200">
                              <ValueTrace
                                className="text-[11px] tabular-nums font-semibold text-slate-500"
                                displayValue={ahPct == null ? '—' : `${ahPct.toFixed(1)}%`}
                                meta={valueTrace.dre.ahVariance(LIQUIDO_LABEL, mes)}
                              />
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
                      <ValueTrace
                        className={cn('text-xs tabular-nums', total.prev != null && total.prev < 0 ? 'text-red-600' : 'text-slate-600')}
                        displayValue={total.prev == null ? '—' : formatCurrency(total.prev)}
                        meta={valueTrace.dre.liquido('Previsto', `Total ${dreYear}`)}
                      />
                    </td>
                    <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
                      <ValueTrace
                        className={cn('text-xs tabular-nums font-medium', total.real != null && total.real < 0 ? 'text-red-600' : 'text-slate-800')}
                        displayValue={total.real == null ? '—' : formatCurrency(total.real)}
                        meta={valueTrace.dre.liquido('Realizado', `Total ${dreYear}`)}
                      />
                    </td>
                    <td className={cn('min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60', !showAV && !showAH && 'border-r border-slate-200')}>
                      <ValueTrace
                        className={cn(
                          'text-xs tabular-nums font-semibold',
                          total.dif == null ? 'text-slate-400' : total.dif < 0 ? 'text-red-600' : total.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
                        )}
                        displayValue={total.dif == null ? '—' : formatCurrency(total.dif)}
                        meta={valueTrace.dre.liquido('Diferença', `Total ${dreYear}`)}
                      />
                    </td>
                    {showAV && (() => {
                      const avPct = receitaBrutaRow ? ratioFromCells(total, totalOf(receitaBrutaRow)) : null;
                      return (
                        <td className={cn('min-w-[70px] px-2 py-1.5 text-right bg-slate-50/60', !showAH && 'border-r border-slate-200')}>
                          <ValueTrace
                            className="text-[11px] tabular-nums font-semibold text-slate-500"
                            displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                            meta={valueTrace.dre.avRatio(LIQUIDO_LABEL, `Total ${dreYear}`, '(+) RECEITA BRUTA')}
                          />
                        </td>
                      );
                    })()}
                    {showAH && (() => {
                      const ahPct = avFromCell(total);
                      return (
                        <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200 bg-slate-50/60">
                          {ahPct == null ? (
                            <span className="text-[11px] text-slate-300">—</span>
                          ) : (
                            <ValueTrace
                              className="text-[11px] tabular-nums font-semibold text-slate-500"
                              displayValue={`${ahPct.toFixed(1)}%`}
                              meta={valueTrace.dre.ahVariance(LIQUIDO_LABEL, `Total ${dreYear}`)}
                            />
                          )}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {resultadosFooter.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Resultados {dreYear}</p>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">Painel de apuração</h3>
            </div>
            {(resultadoLiquidoFooter || resultadoOperacional) && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {resultadoLiquidoFooter ? 'Resultado líquido (real)' : 'Resultado operacional (real)'}
                </p>
                <p
                  className={cn(
                    'text-2xl font-extrabold tabular-nums mt-0.5',
                    ((resultadoLiquidoFooter || resultadoOperacional)!.total.real ?? 0) < 0
                      ? 'text-red-600'
                      : 'text-[#004D40]'
                  )}
                >
                  {(resultadoLiquidoFooter || resultadoOperacional)!.total.real == null
                    ? '—'
                    : formatCurrency((resultadoLiquidoFooter || resultadoOperacional)!.total.real!)}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-px bg-slate-100">
            {resultadosFooter.map((item) => {
              const real = item.total.real;
              const prev = item.total.prev;
              const dif = item.total.dif;
              const barPct =
                item.atingimento == null
                  ? 0
                  : Math.max(0, Math.min(100, Math.abs(item.atingimento)));
              const accentBar =
                item.accent === 'brand'
                  ? 'bg-[#004D40]'
                  : item.accent === 'emerald'
                    ? 'bg-emerald-500'
                    : item.accent === 'teal'
                      ? 'bg-teal-500'
                      : item.accent === 'sky'
                        ? 'bg-sky-500'
                        : 'bg-amber-500';
              const accentSoft =
                item.accent === 'brand'
                  ? 'bg-[#004D40]/10'
                  : item.accent === 'emerald'
                    ? 'bg-emerald-100'
                    : item.accent === 'teal'
                      ? 'bg-teal-100'
                      : item.accent === 'sky'
                        ? 'bg-sky-100'
                        : 'bg-amber-100';

              return (
                <div key={item.id} className="bg-white p-4 flex flex-col gap-3 min-h-[148px]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-tight">
                      {item.short}
                    </p>
                    {item.atingimento != null && (
                      <span className="shrink-0 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {item.atingimento.toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Diferença
                    </p>
                    <p
                      className={cn(
                        'text-xl font-extrabold tabular-nums leading-none',
                        dif == null
                          ? 'text-slate-900'
                          : dif < 0
                            ? 'text-red-600'
                            : dif > 0
                              ? 'text-emerald-700'
                              : 'text-slate-900'
                      )}
                    >
                      {dif == null ? '—' : `${dif > 0 ? '+' : ''}${formatCurrency(dif)}`}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">
                      Realizado {real == null ? '—' : formatCurrency(real)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                      Previsto {prev == null ? '—' : formatCurrency(prev)}
                    </p>
                  </div>

                  <div className="mt-auto space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Atingimento</span>
                      <span className="tabular-nums text-slate-600">
                        {item.atingimento == null ? '—' : `${item.atingimento.toFixed(0)}%`}
                      </span>
                    </div>
                    <div className={cn('h-2 rounded-full overflow-hidden', accentSoft)}>
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', accentBar)}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {resultadoOperacional?.row && (
            <div className="px-5 py-4 border-t border-slate-100 bg-white/70">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Resultado operacional por mês (realizado)
              </p>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.max(visibleMonths.length, 1)}, minmax(0, 1fr))` }}
              >
                {visibleMonths.map((monthIndex) => {
                  const mes = MESES[monthIndex];
                  const cell = effective(resultadoOperacional.row!, monthIndex);
                  const val = cell.real;
                  const maxAbs = Math.max(
                    ...visibleMonths.map((i) => Math.abs(effective(resultadoOperacional.row!, i).real ?? 0)),
                    1
                  );
                  const heightPct = val == null ? 0 : Math.max(8, (Math.abs(val) / maxAbs) * 100);
                  return (
                    <div key={mes} className="flex flex-col items-center gap-1.5 min-w-0">
                      <div className="h-16 w-full flex items-end justify-center">
                        <div
                          className={cn(
                            'w-full max-w-[18px] rounded-t-md transition-all',
                            val == null
                              ? 'bg-slate-100 h-1'
                              : val < 0
                                ? 'bg-red-400/80'
                                : 'bg-[#004D40]/80'
                          )}
                          style={{ height: val == null ? 4 : `${heightPct}%` }}
                          title={`${mes}: ${val == null ? '—' : formatCurrency(val)}`}
                        />
                      </div>
                      <span className="text-[9px] font-bold uppercase text-slate-400 truncate w-full text-center">
                        {mes.slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Ajustes</h3>
              <p className="text-xs text-slate-500">
                Histórico de valores alterados manualmente no DRE {dreYear}.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-slate-400">
            {ajustes.length} registro{ajustes.length === 1 ? '' : 's'}
          </span>
        </div>
        {ajustesError && (
          <div className="px-5 py-3 text-sm text-amber-800 bg-amber-50 border-b border-amber-100">
            {ajustesError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data / hora</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Usuário</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Linha</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Mês</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Campo</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Anterior</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Novo</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ajustes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    Nenhum ajuste registrado ainda.
                  </td>
                </tr>
              )}
              {ajustes.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{formatWhen(a.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">
                    {a.user_name || '—'}
                    {a.user_email ? (
                      <span className="block text-[10px] text-slate-400">{a.user_email}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-800">{a.row_label || `Linha ${a.row_key}`}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{MESES[a.month - 1] || a.month}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{a.field === 'prev' ? 'Previsto' : 'Realizado'}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-right text-slate-500">
                    {a.previous_value == null ? '—' : formatCurrency(a.previous_value)}
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-right font-semibold text-slate-800">
                    {formatCurrency(a.new_value)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[280px]">{a.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adjustModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-100"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ajustar valor</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {adjustModal.field === 'prev' ? 'Previsto' : 'Realizado'} · {adjustModal.row.label} ·{' '}
                  {MESES[adjustModal.monthIndex]}/{dreYear}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAdjustModal}
                disabled={savingCell}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Valor atual</p>
                <p className="text-lg font-extrabold tabular-nums text-slate-800">
                  {adjustModal.currentValue == null ? '—' : formatCurrency(adjustModal.currentValue)}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                  Novo valor *
                </label>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveAdjustModal();
                    if (e.key === 'Escape') closeAdjustModal();
                  }}
                  disabled={savingCell}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                  placeholder="Ex.: 12500,50"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">
                  Motivo *
                </label>
                <textarea
                  value={adjustMotivo}
                  onChange={(e) => setAdjustMotivo(e.target.value)}
                  disabled={savingCell}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-y"
                  placeholder="Descreva por que este valor está sendo ajustado"
                />
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-500 space-y-0.5">
                <p>
                  <span className="font-semibold text-slate-600">Usuário:</span>{' '}
                  {user?.name || 'usuário da sessão'}
                  {user?.email ? ` (${user.email})` : ''}
                </p>
                <p>
                  <span className="font-semibold text-slate-600">Registro:</span> data e hora serão gravadas ao confirmar
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeAdjustModal}
                disabled={savingCell}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveAdjustModal}
                disabled={savingCell}
                className="px-4 py-2 text-sm font-bold text-white bg-[#004D40] hover:bg-[#003d33] rounded-xl disabled:opacity-60"
              >
                {savingCell ? 'Registrando…' : 'Registrar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
