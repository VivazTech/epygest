import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn, fetchJson, formatCurrency } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import { hasPermission } from '../lib/permissionCatalog';
import {
  AQUA_BLOCOS,
  AQUA_PARAMETROS_PADRAO,
  DESCRICAO_REGRA_PREVISTO,
  DESCRICAO_REGRA_REALIZADO,
  REGRAS_PREVISTO,
  REGRAS_REALIZADO,
  REGRAS_SINTESE,
  calcularCustoVaga,
  mesesAcumulados,
  montarPrevReal,
  resumirQuadro,
  ymKey,
  type AquaCenario,
  type AquaFontesRealizado,
  type AquaLinha,
  type AquaLinhaResultado,
  type AquaMes,
  type AquaModoQuadro,
  type AquaParametros,
  type AquaPremissas,
  type AquaValorCelula,
  type AquaVaga,
} from '../lib/aquaOrcamento';

// ─── Tipos da API ───────────────────────────────────────────────────────────

type Temporada = {
  id: number;
  nome: string;
  ano_inicio: number;
  mes_inicio: number;
  acumulado_ate_ano: number | null;
  acumulado_ate_mes: number | null;
  status: string;
};

type ValorRow = AquaValorCelula & { linha_id: number; ano: number; mes: number };

type Dados = {
  temporada: Temporada;
  meses: AquaMes[];
  linhas: AquaLinha[];
  valores: ValorRow[];
  premissas: Array<AquaPremissas & { ano: number; mes: number }>;
  parametros: AquaParametros;
  vagas: Array<AquaVaga & { id: number }>;
  calendario: Record<string, string>;
  fontes: AquaFontesRealizado;
  fontes_status: Record<string, string>;
};

type Aba = 'prev-real' | 'premissas' | 'quadro' | 'parametros' | 'estrutura';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'prev-real', label: 'Prev x Real' },
  { id: 'premissas', label: 'Premissas e Síntese' },
  { id: 'quadro', label: 'Quadro de Pessoal' },
  { id: 'parametros', label: 'Parâmetros' },
  { id: 'estrutura', label: 'Estrutura' },
];

const LS_TEMPORADA = 'aquaOrcamento.temporada';
const LS_ABA = 'aquaOrcamento.aba';

const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

const fmt = (v: number) => (Math.abs(v) < 0.005 ? '—' : formatCurrency(v));
const fmtNum = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(v);
const fmtPct = (v: number | null) => (v === null || !Number.isFinite(v) ? 'N.A' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

const parseNum = (s: string): number | null => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};

const card = 'bg-white rounded-2xl border border-slate-200 shadow-sm';
const th = 'px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest';

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const { res, json } = await fetchJson<any>(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(json?.error || `Erro ${res.status}`);
  return json as T;
}

// ─── Página ─────────────────────────────────────────────────────────────────

export const AquaOrcamentoPage: React.FC<{ user?: any }> = ({ user }) => {
  const { showSuccess } = useToast();
  const canEdit = hasPermission(user?.permissions, 'aqua-orcamento', 'edit', user?.role);
  const [temporadas, setTemporadas] = useState<Temporada[] | null>(null);
  const [temporadaId, setTemporadaId] = useState<number | null>(() => Number(lsGet(LS_TEMPORADA)) || null);
  const [aba, setAba] = useState<Aba>(() => (lsGet(LS_ABA) as Aba) || 'prev-real');
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const carregarTemporadas = useCallback(async () => {
    try {
      const r = await api<{ temporadas: Temporada[] }>('/api/aqua/temporadas');
      setTemporadas(r.temporadas);
      setErro(null);
      setTemporadaId((atual) => (atual && r.temporadas.some((t) => t.id === atual) ? atual : r.temporadas[0]?.id ?? null));
    } catch (e: any) {
      setErro(e.message);
      setTemporadas([]);
    }
  }, []);

  const carregarDados = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const r = await api<Dados>(`/api/aqua/temporadas/${id}/dados`);
      setDados(r);
      setErro(null);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregarTemporadas();
  }, [carregarTemporadas]);

  useEffect(() => {
    if (!temporadaId) return;
    lsSet(LS_TEMPORADA, String(temporadaId));
    void carregarDados(temporadaId);
  }, [temporadaId, carregarDados]);

  useEffect(() => lsSet(LS_ABA, aba), [aba]);

  // Edições locais refletem na hora; a API grava em seguida
  const atualizarValor = useCallback(
    async (linhaId: number, m: AquaMes, campo: 'previsto_manual' | 'ajuste_previsto' | 'ajuste_realizado' | 'obs', valor: number | string | null) => {
      setDados((d) => {
        if (!d) return d;
        const idx = d.valores.findIndex((v) => v.linha_id === linhaId && v.ano === m.ano && v.mes === m.mes);
        const base: ValorRow = idx >= 0 ? d.valores[idx] : { linha_id: linhaId, ano: m.ano, mes: m.mes, previsto_manual: null, ajuste_previsto: 0, ajuste_realizado: 0 };
        const novo = { ...base, [campo]: valor } as ValorRow;
        const valores = [...d.valores];
        if (idx >= 0) valores[idx] = novo;
        else valores.push(novo);
        return { ...d, valores };
      });
      try {
        await api('/api/aqua/valores', { method: 'PATCH', body: JSON.stringify({ linha_id: linhaId, ano: m.ano, mes: m.mes, campo, valor }) });
      } catch (e: any) {
        setErro(e.message);
      }
    },
    []
  );

  const atualizarPremissa = useCallback(
    async (m: AquaMes, campo: keyof AquaPremissas, valor: number) => {
      if (!dados) return;
      setDados((d) => {
        if (!d) return d;
        const idx = d.premissas.findIndex((p) => p.ano === m.ano && p.mes === m.mes);
        const premissas = [...d.premissas];
        if (idx >= 0) premissas[idx] = { ...premissas[idx], [campo]: valor };
        else premissas.push({ ano: m.ano, mes: m.mes, passantes: 0, passantes_ano_ant: 0, hospedes: 0, ingresso_pax: 0, servicos_passante: 0, bar_pax: 0, lanchonete_pax: 0, repasse_pax: 0, qtd_vale_alimentacao: 0, [campo]: valor });
        return { ...d, premissas };
      });
      try {
        await api(`/api/aqua/temporadas/${dados.temporada.id}/premissas`, { method: 'PUT', body: JSON.stringify({ ano: m.ano, mes: m.mes, campo, valor }) });
      } catch (e: any) {
        setErro(e.message);
      }
    },
    [dados]
  );

  const atualizarTemporada = useCallback(
    async (patch: Partial<Temporada>) => {
      if (!dados) return;
      setDados((d) => (d ? { ...d, temporada: { ...d.temporada, ...patch } } : d));
      try {
        await api(`/api/aqua/temporadas/${dados.temporada.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      } catch (e: any) {
        setErro(e.message);
      }
    },
    [dados]
  );

  const prevReal = useMemo(() => {
    if (!dados) return null;
    const t = dados.temporada;
    const valores: Record<number, Record<string, AquaValorCelula>> = {};
    for (const v of dados.valores) (valores[v.linha_id] ??= {})[ymKey(v.ano, v.mes)] = v;
    const premissas: Record<string, AquaPremissas> = {};
    for (const p of dados.premissas) premissas[ymKey(p.ano, p.mes)] = p;
    const folhaQuadro: Record<string, number> = {};
    for (const m of dados.meses) {
      const cen = dados.calendario[m.key];
      if (cen === 'alta' || cen === 'baixa') {
        folhaQuadro[m.key] = resumirQuadro(dados.vagas.filter((v) => v.cenario === cen), dados.parametros).total_planilha;
      }
    }
    return montarPrevReal({
      meses: dados.meses,
      acumulado: mesesAcumulados(dados.meses, t.acumulado_ate_ano, t.acumulado_ate_mes),
      linhas: dados.linhas.map((l) => ({ ...l, id: Number(l.id), parent_id: l.parent_id ? Number(l.parent_id) : null })),
      valores,
      premissas,
      parametros: dados.parametros,
      fontes: dados.fontes,
      folhaQuadro,
    });
  }, [dados]);

  const novaTemporada = async () => {
    const ano = Number(window.prompt('Ano de início da temporada (ex.: 2027 para set/2027 → ago/2028)', String(new Date().getFullYear())));
    if (!ano) return;
    try {
      const r = await api<{ temporada: Temporada }>('/api/aqua/temporadas', { method: 'POST', body: JSON.stringify({ ano_inicio: ano, mes_inicio: 9 }) });
      await carregarTemporadas();
      setTemporadaId(r.temporada.id);
      showSuccess(`Temporada ${r.temporada.nome} criada.`);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orçamento Aquamania</h1>
          <p className="text-sm text-slate-500">Previsto × Realizado da temporada, premissas, quadro de pessoal e parâmetros.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {temporadas && temporadas.length > 0 && (
            <select
              value={temporadaId ?? ''}
              onChange={(e) => setTemporadaId(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              aria-label="Temporada"
            >
              {temporadas.map((t) => (
                <option key={t.id} value={t.id}>
                  Temporada {t.nome}
                </option>
              ))}
            </select>
          )}
          {dados && (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Acumulado até
              <select
                value={dados.temporada.acumulado_ate_ano ? ymKey(dados.temporada.acumulado_ate_ano, dados.temporada.acumulado_ate_mes ?? 1) : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  void atualizarTemporada(v ? { acumulado_ate_ano: Number(v.slice(0, 4)), acumulado_ate_mes: Number(v.slice(5)) } : { acumulado_ate_ano: null, acumulado_ate_mes: null });
                }}
                disabled={!canEdit}
                className="px-2 py-2 rounded-xl border border-slate-200 text-sm bg-white text-slate-800"
              >
                <option value="">Temporada inteira</option>
                {dados.meses.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => temporadaId && void carregarDados(temporadaId)}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title="Recarregar"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          {canEdit && (
            <>
              <button onClick={novaTemporada} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50">
                <Plus className="w-4 h-4" /> Nova temporada
              </button>
              <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800">
                <Upload className="w-4 h-4" /> Importar planilhas
              </button>
            </>
          )}
        </div>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {temporadas && temporadas.length === 0 && !erro && (
        <div className={cn(card, 'p-8 text-center space-y-3')}>
          <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-400" />
          <p className="text-slate-700 font-medium">Nenhuma temporada cadastrada.</p>
          <p className="text-sm text-slate-500">
            Importe as planilhas "Aquamania Dados para Orçamento" e "Quadro de Empregados" para criar a temporada com a mesma estrutura e valores.
          </p>
          {canEdit && (
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm">
              <Upload className="w-4 h-4" /> Importar planilhas
            </button>
          )}
        </div>
      )}

      {dados && prevReal && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {ABAS.filter((a) => a.id !== 'estrutura' || canEdit).map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
                  aba === a.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                {a.label}
              </button>
            ))}
          </div>

          {aba === 'prev-real' && <AbaPrevReal dados={dados} linhas={prevReal.linhas} canEdit={canEdit} onValor={atualizarValor} />}
          {aba === 'premissas' && (
            <AbaPremissas dados={dados} sintese={prevReal.sintese} linhas={prevReal.linhas} canEdit={canEdit} onPremissa={atualizarPremissa} onValor={atualizarValor} />
          )}
          {aba === 'quadro' && <AbaQuadro dados={dados} canEdit={canEdit} setDados={setDados} onErro={setErro} />}
          {aba === 'parametros' && <AbaParametros dados={dados} canEdit={canEdit} setDados={setDados} onErro={setErro} onSalvo={() => showSuccess('Parâmetros salvos.')} />}
          {aba === 'estrutura' && canEdit && <AbaEstrutura dados={dados} setDados={setDados} onErro={setErro} />}
        </>
      )}

      {importOpen && (
        <ImportarModal
          onClose={() => setImportOpen(false)}
          onImportado={async (t) => {
            setImportOpen(false);
            await carregarTemporadas();
            setTemporadaId(t.id);
            if (t.id === temporadaId) void carregarDados(t.id);
            showSuccess(`Temporada ${t.nome} importada.`);
          }}
        />
      )}
    </div>
  );
};

// ─── Prev x Real ────────────────────────────────────────────────────────────

const ehDespesa = (l: AquaLinhaResultado) => l.bloco !== 'FATURAMENTO' && l.bloco !== 'RESULTADO';

/** Vermelho quando o desvio é desfavorável (despesa acima / receita abaixo do previsto). */
const corDiferenca = (l: AquaLinhaResultado, dif: number) => {
  if (Math.abs(dif) < 0.005) return 'text-slate-400';
  const ruim = ehDespesa(l) ? dif > 0 : dif < 0;
  return ruim ? 'text-red-600' : 'text-emerald-600';
};

type CelulaEdit = { linha: AquaLinhaResultado; mes: AquaMes };

const AbaPrevReal: React.FC<{
  dados: Dados;
  linhas: AquaLinhaResultado[];
  canEdit: boolean;
  onValor: (linhaId: number, m: AquaMes, campo: 'previsto_manual' | 'ajuste_previsto' | 'ajuste_realizado' | 'obs', valor: number | string | null) => Promise<void>;
}> = ({ dados, linhas, canEdit, onValor }) => {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.depth === 0).map((l) => String(l.id))));
  const [mesesVisiveis, setMesesVisiveis] = useState<Set<string>>(() => new Set(dados.meses.map((m) => m.key)));
  const [edit, setEdit] = useState<CelulaEdit | null>(null);

  const visiveis = useMemo(() => {
    const porId = new Map(linhas.map((l) => [String(l.id), l]));
    return linhas.filter((l) => {
      let p = l.parent_id !== null ? porId.get(String(l.parent_id)) : undefined;
      while (p) {
        if (!abertos.has(String(p.id))) return false;
        p = p.parent_id !== null ? porId.get(String(p.parent_id)) : undefined;
      }
      return true;
    });
  }, [linhas, abertos]);

  const meses = dados.meses.filter((m) => mesesVisiveis.has(m.key));
  const toggle = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const expandirTudo = (nivel: number | null) =>
    setAbertos(new Set(linhas.filter((l) => l.tem_filhos && (nivel === null || l.depth < nivel)).map((l) => String(l.id))));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Meses:</span>
        {dados.meses.map((m) => (
          <button
            key={m.key}
            onClick={() =>
              setMesesVisiveis((s) => {
                const n = new Set(s);
                if (n.has(m.key)) n.delete(m.key);
                else n.add(m.key);
                return n;
              })
            }
            className={cn('px-2 py-1 rounded-lg border', mesesVisiveis.has(m.key) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200')}
          >
            {m.label}
          </button>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        <button onClick={() => expandirTudo(1)} className="text-slate-600 hover:text-slate-900">Recolher</button>
        <button onClick={() => expandirTudo(2)} className="text-slate-600 hover:text-slate-900">Grupos</button>
        <button onClick={() => expandirTudo(null)} className="text-slate-600 hover:text-slate-900">Expandir tudo</button>
      </div>

      <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-4">
        {Object.entries(dados.fontes_status).map(([k, v]) => (
          <span key={k}>• {v}</span>
        ))}
        {canEdit && <span className="text-slate-400">Clique numa célula para digitar previsto, ajuste ou observação.</span>}
      </div>

      <div className={cn(card, 'overflow-auto max-h-[75vh]')}>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr>
              <th rowSpan={2} className={cn(th, 'text-left sticky left-0 z-30 bg-slate-50 min-w-[280px]')}>
                Conta
              </th>
              {meses.map((m) => (
                <th key={m.key} colSpan={3} className={cn(th, 'text-center border-l border-slate-200')}>
                  {m.label}
                </th>
              ))}
              <th colSpan={4} className={cn(th, 'text-center border-l-2 border-slate-300 bg-slate-100')}>
                Acumulado
              </th>
            </tr>
            <tr>
              {meses.map((m) => (
                <React.Fragment key={m.key}>
                  <th className={cn(th, 'text-right border-l border-slate-200')}>Previsto</th>
                  <th className={cn(th, 'text-right')}>Realizado</th>
                  <th className={cn(th, 'text-right')}>Dif.</th>
                </React.Fragment>
              ))}
              <th className={cn(th, 'text-right border-l-2 border-slate-300 bg-slate-100')}>Previsto</th>
              <th className={cn(th, 'text-right bg-slate-100')}>Realizado</th>
              <th className={cn(th, 'text-right bg-slate-100')}>Dif.</th>
              <th className={cn(th, 'text-right bg-slate-100')}>%</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const destaque = l.depth === 0;
              const editavel = canEdit && typeof l.id === 'number';
              return (
                <tr key={String(l.id)} className={cn('border-t border-slate-100', destaque ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700', l.id === 'RESULTADO' && 'bg-slate-900 text-white')}>
                  <td className={cn('sticky left-0 z-10 px-3 py-1.5 whitespace-nowrap', l.id === 'RESULTADO' ? 'bg-slate-900' : destaque ? 'bg-slate-50' : 'bg-white')}>
                    <div className="flex items-center gap-1" style={{ paddingLeft: l.depth * 14 }}>
                      {l.tem_filhos ? (
                        <button onClick={() => toggle(String(l.id))} className="p-0.5 text-slate-400 hover:text-slate-700" aria-label="Expandir">
                          {abertos.has(String(l.id)) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-4" />
                      )}
                      <span title={`Previsto: ${DESCRICAO_REGRA_PREVISTO[l.regra_previsto as keyof typeof DESCRICAO_REGRA_PREVISTO] ?? l.regra_previsto}\nRealizado: ${DESCRICAO_REGRA_REALIZADO[l.regra_realizado as keyof typeof DESCRICAO_REGRA_REALIZADO] ?? l.regra_realizado}${l.chave_realizado ? ` (${l.chave_realizado})` : ''}`}>
                        {l.rotulo}
                      </span>
                    </div>
                  </td>
                  {meses.map((m) => {
                    const c = l.meses[m.key];
                    const ajustado = Math.abs(c.ajuste) > 0.005;
                    return (
                      <React.Fragment key={m.key}>
                        <td
                          onClick={() => editavel && setEdit({ linha: l, mes: m })}
                          className={cn('px-2 py-1.5 text-right tabular-nums border-l border-slate-100', editavel && 'cursor-pointer hover:bg-sky-50')}
                        >
                          {fmt(c.previsto)}
                        </td>
                        <td
                          onClick={() => editavel && setEdit({ linha: l, mes: m })}
                          className={cn('px-2 py-1.5 text-right tabular-nums', editavel && 'cursor-pointer hover:bg-sky-50', ajustado && 'underline decoration-dotted decoration-amber-500')}
                          title={ajustado ? `Fonte ${formatCurrency(c.fonte)} + ajuste ${formatCurrency(c.ajuste)}` : undefined}
                        >
                          {fmt(c.realizado)}
                        </td>
                        <td className={cn('px-2 py-1.5 text-right tabular-nums', l.id === 'RESULTADO' ? '' : corDiferenca(l, c.diferenca))}>{fmt(c.diferenca)}</td>
                      </React.Fragment>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right tabular-nums border-l-2 border-slate-300">{fmt(l.acumulado.previsto)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(l.acumulado.realizado)}</td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums', l.id === 'RESULTADO' ? '' : corDiferenca(l, l.acumulado.diferenca))}>{fmt(l.acumulado.diferenca)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(l.acumulado.pct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <EditarCelulaModal
          edit={edit}
          valor={dados.valores.find((v) => v.linha_id === edit.linha.id && v.ano === edit.mes.ano && v.mes === edit.mes.mes)}
          onClose={() => setEdit(null)}
          onSalvar={async (patch) => {
            for (const [campo, valor] of Object.entries(patch)) await onValor(Number(edit.linha.id), edit.mes, campo as any, valor as any);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
};

const EditarCelulaModal: React.FC<{
  edit: CelulaEdit;
  valor?: ValorRow;
  onClose: () => void;
  onSalvar: (patch: Record<string, number | string | null>) => Promise<void>;
}> = ({ edit, valor, onClose, onSalvar }) => {
  const { linha, mes } = edit;
  const c = linha.meses[mes.key];
  const manual = linha.regra_previsto === 'manual' || linha.regra_previsto === 'repasse_vivaz';
  const calculado = !manual && linha.regra_previsto !== 'soma_filhos';
  const [previsto, setPrevisto] = useState(valor?.previsto_manual != null ? String(valor.previsto_manual).replace('.', ',') : '');
  const [ajPrev, setAjPrev] = useState(valor?.ajuste_previsto ? String(valor.ajuste_previsto).replace('.', ',') : '');
  const [ajReal, setAjReal] = useState(valor?.ajuste_realizado ? String(valor.ajuste_realizado).replace('.', ',') : '');
  const [obs, setObs] = useState(valor?.obs ?? '');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    const patch: Record<string, number | string | null> = {};
    if (manual || calculado) patch.previsto_manual = parseNum(previsto);
    if (calculado) patch.ajuste_previsto = parseNum(ajPrev) ?? 0;
    patch.ajuste_realizado = parseNum(ajReal) ?? 0;
    patch.obs = obs.trim() || null;
    await onSalvar(patch);
    setSalvando(false);
  };

  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-slate-900">{linha.rotulo}</h3>
            <p className="text-xs text-slate-500">{mes.label}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="text-xs text-slate-600 space-y-1 bg-slate-50 rounded-xl p-3">
          <div>
            <b>Previsto:</b> {DESCRICAO_REGRA_PREVISTO[linha.regra_previsto as keyof typeof DESCRICAO_REGRA_PREVISTO] ?? linha.regra_previsto} = {formatCurrency(c.previsto)}
          </div>
          <div>
            <b>Realizado:</b> {DESCRICAO_REGRA_REALIZADO[linha.regra_realizado as keyof typeof DESCRICAO_REGRA_REALIZADO] ?? linha.regra_realizado}
            {linha.chave_realizado ? ` (${linha.chave_realizado})` : ''} = {formatCurrency(c.fonte)}
          </div>
        </div>
        {manual && (
          <label className="block text-xs font-semibold text-slate-600">
            Previsto
            <input className={input} value={previsto} onChange={(e) => setPrevisto(e.target.value)} inputMode="decimal" autoFocus />
          </label>
        )}
        {calculado && (
          <>
            <label className="block text-xs font-semibold text-slate-600">
              Substituir a fórmula por (vazio = usa a fórmula)
              <input className={input} value={previsto} onChange={(e) => setPrevisto(e.target.value)} inputMode="decimal" />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Somar ao previsto calculado
              <input className={input} value={ajPrev} onChange={(e) => setAjPrev(e.target.value)} inputMode="decimal" />
            </label>
          </>
        )}
        <label className="block text-xs font-semibold text-slate-600">
          {linha.regra_realizado === 'manual' ? 'Realizado' : 'Ajuste somado ao realizado da fonte'}
          <input className={input} value={ajReal} onChange={(e) => setAjReal(e.target.value)} inputMode="decimal" />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Observação
          <input className={input} value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50">
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Premissas e Síntese ────────────────────────────────────────────────────

const PREMISSAS_ROTULOS: Array<[keyof AquaPremissas, string, boolean]> = [
  ['passantes', 'Número de passantes', false],
  ['passantes_ano_ant', 'Passantes — ano anterior', false],
  ['hospedes', 'Número de hóspedes', false],
  ['ingresso_pax', 'Ingresso por pax (R$)', true],
  ['servicos_passante', 'Serviços diversos por passante (R$)', true],
  ['bar_pax', 'A&B Bar por pax (R$)', true],
  ['lanchonete_pax', 'A&B Lanchonete por pax (R$)', true],
  ['repasse_pax', 'Repasse por pax (R$)', true],
  ['qtd_vale_alimentacao', 'Funcionários com vale-alimentação', false],
];

const SINTESE_ROTULOS: Array<[string, string]> = [
  ['ingressos', 'Ingressos'],
  ['servicos', 'Serviços diversos'],
  ['bar', 'A&B Bar'],
  ['lanchonete', 'A&B Lanchonete'],
  ['comissao_influencer', 'Comissão faturamentos (362)'],
  ['comissao_cartao', 'Comissão taxa cartão (154)'],
  ['vale_alimentacao', 'Vale alimentação (308)'],
  ['iss', 'ISS (314)'],
  ['icms', 'ICMS (315)'],
  ['pis', 'PIS (316)'],
  ['cofins', 'COFINS (317)'],
  ['cmv', 'CMV'],
];

const InputCelula: React.FC<{ valor: number | null; onSalvar: (v: number | null) => void; disabled?: boolean; className?: string }> = ({ valor, onSalvar, disabled, className }) => {
  const [txt, setTxt] = useState(valor === null || valor === undefined ? '' : fmtNum(valor));
  useEffect(() => setTxt(valor === null || valor === undefined ? '' : fmtNum(valor)), [valor]);
  return (
    <input
      value={txt}
      disabled={disabled}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const n = parseNum(txt);
        if (n !== (valor ?? null)) onSalvar(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      inputMode="decimal"
      className={cn('w-full min-w-[84px] px-2 py-1 text-right text-xs tabular-nums rounded-md border border-transparent hover:border-slate-200 focus:border-sky-400 focus:outline-none bg-transparent disabled:text-slate-500', className)}
    />
  );
};

const AbaPremissas: React.FC<{
  dados: Dados;
  sintese: Record<string, any>;
  linhas: AquaLinhaResultado[];
  canEdit: boolean;
  onPremissa: (m: AquaMes, campo: keyof AquaPremissas, valor: number) => Promise<void>;
  onValor: (linhaId: number, m: AquaMes, campo: 'previsto_manual', valor: number | null) => Promise<void>;
}> = ({ dados, sintese, linhas, canEdit, onPremissa, onValor }) => {
  const premissa = (m: AquaMes) => dados.premissas.find((p) => p.ano === m.ano && p.mes === m.mes);
  const manuais = linhas.filter((l) => typeof l.id === 'number' && (l.regra_previsto === 'manual' || l.regra_previsto === 'repasse_vivaz') && !l.tem_filhos);
  const valorManual = (id: number, m: AquaMes) => dados.valores.find((v) => v.linha_id === id && v.ano === m.ano && v.mes === m.mes)?.previsto_manual ?? null;
  const [filtro, setFiltro] = useState('');
  const manuaisFiltradas = manuais.filter((l) => !filtro || l.rotulo.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <div className="space-y-6">
      <section className={cn(card, 'overflow-auto')}>
        <h2 className="px-4 pt-4 font-bold text-slate-800">Premissas (células amarelas da Síntese)</h2>
        <table className="w-full border-collapse text-xs mt-2">
          <thead className="bg-slate-50">
            <tr>
              <th className={cn(th, 'text-left min-w-[240px]')}>Premissa</th>
              {dados.meses.map((m) => (
                <th key={m.key} className={cn(th, 'text-right')}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PREMISSAS_ROTULOS.map(([campo, rotulo]) => (
              <tr key={campo} className="border-t border-slate-100">
                <td className="px-3 py-1 text-slate-700">{rotulo}</td>
                {dados.meses.map((m) => (
                  <td key={m.key} className="px-1 py-0.5 bg-amber-50/40">
                    <InputCelula valor={Number(premissa(m)?.[campo] ?? 0)} disabled={!canEdit} onSalvar={(v) => void onPremissa(m, campo, v ?? 0)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={cn(card, 'overflow-auto')}>
        <h2 className="px-4 pt-4 font-bold text-slate-800">Síntese calculada</h2>
        <p className="px-4 text-xs text-slate-500">Recalcula na hora a partir das premissas e dos parâmetros. Valores digitados por cima da fórmula são editados no Prev x Real.</p>
        <table className="w-full border-collapse text-xs mt-2">
          <thead className="bg-slate-50">
            <tr>
              <th className={cn(th, 'text-left min-w-[240px]')}>Linha</th>
              {dados.meses.map((m) => (
                <th key={m.key} className={cn(th, 'text-right')}>
                  {m.label}
                </th>
              ))}
              <th className={cn(th, 'text-right')}>Total</th>
            </tr>
          </thead>
          <tbody>
            {SINTESE_ROTULOS.map(([k, rotulo]) => {
              const total = dados.meses.reduce((acc, m) => acc + (sintese[m.key]?.[k] ?? 0), 0);
              return (
                <tr key={k} className="border-t border-slate-100" title={DESCRICAO_REGRA_PREVISTO[k as keyof typeof DESCRICAO_REGRA_PREVISTO]}>
                  <td className="px-3 py-1.5 text-slate-700">{rotulo}</td>
                  {dados.meses.map((m) => (
                    <td key={m.key} className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(sintese[m.key]?.[k] ?? 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold">{fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className={cn(card, 'overflow-auto')}>
        <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-800">Despesas e receitas digitadas (previsto)</h2>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar conta..." className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm" />
        </div>
        <table className="w-full border-collapse text-xs mt-2">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className={cn(th, 'text-left min-w-[280px]')}>Conta</th>
              {dados.meses.map((m) => (
                <th key={m.key} className={cn(th, 'text-right')}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {manuaisFiltradas.map((l) => (
              <tr key={String(l.id)} className="border-t border-slate-100">
                <td className="px-3 py-1 text-slate-700 whitespace-nowrap">{l.rotulo}</td>
                {dados.meses.map((m) => (
                  <td key={m.key} className="px-1 py-0.5">
                    <InputCelula valor={valorManual(Number(l.id), m)} disabled={!canEdit} onSalvar={(v) => void onValor(Number(l.id), m, 'previsto_manual', v)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

// ─── Quadro de Pessoal ──────────────────────────────────────────────────────

const CENARIOS: { id: AquaCenario; label: string }[] = [
  { id: 'baixa', label: 'Baixa temporada' },
  { id: 'alta', label: 'Alta temporada' },
  { id: 'recreacao', label: 'Recreação (simulação)' },
];

const AbaQuadro: React.FC<{
  dados: Dados;
  canEdit: boolean;
  setDados: React.Dispatch<React.SetStateAction<Dados | null>>;
  onErro: (m: string) => void;
}> = ({ dados, canEdit, setDados, onErro }) => {
  const [cenario, setCenario] = useState<AquaCenario>('baixa');
  const [modo, setModo] = useState<AquaModoQuadro>('planilha');
  const params = dados.parametros;
  const vagas = dados.vagas.filter((v) => v.cenario === cenario).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.id - b.id);
  const setores = [...new Set(vagas.map((v) => v.setor))];
  const resumo = resumirQuadro(vagas, params, modo);

  const salvarVaga = async (id: number, patch: Partial<AquaVaga>) => {
    setDados((d) => (d ? { ...d, vagas: d.vagas.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : d));
    try {
      await api(`/api/aqua/vagas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (e: any) {
      onErro(e.message);
    }
  };
  const novaVaga = async (setor: string) => {
    try {
      const r = await api<{ vaga: AquaVaga & { id: number } }>(`/api/aqua/temporadas/${dados.temporada.id}/vagas`, {
        method: 'POST',
        body: JSON.stringify({ cenario, setor, cargo: 'NOVA VAGA', salario: 0, quantidade: 1, ordem: (vagas.at(-1)?.ordem ?? 0) + 1 }),
      });
      setDados((d) => (d ? { ...d, vagas: [...d.vagas, r.vaga] } : d));
    } catch (e: any) {
      onErro(e.message);
    }
  };
  const excluirVaga = async (id: number) => {
    if (!window.confirm('Excluir esta vaga?')) return;
    setDados((d) => (d ? { ...d, vagas: d.vagas.filter((v) => v.id !== id) } : d));
    try {
      await api(`/api/aqua/vagas/${id}`, { method: 'DELETE' });
    } catch (e: any) {
      onErro(e.message);
    }
  };
  const duplicar = async (de: AquaCenario, para: AquaCenario) => {
    if (!window.confirm(`Substituir todas as vagas de "${para}" por uma cópia de "${de}"?`)) return;
    try {
      await api(`/api/aqua/temporadas/${dados.temporada.id}/quadro/duplicar`, { method: 'POST', body: JSON.stringify({ de, para }) });
      const r = await api<Dados>(`/api/aqua/temporadas/${dados.temporada.id}/dados`);
      setDados(r);
    } catch (e: any) {
      onErro(e.message);
    }
  };

  const meses = dados.meses.filter((m) => dados.calendario[m.key] === cenario);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {CENARIOS.map((c) => (
          <button key={c.id} onClick={() => setCenario(c.id)} className={cn('px-3 py-1.5 rounded-xl text-sm border', cenario === c.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200')}>
            {c.label}
          </button>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={modo === 'corrigido'} onChange={(e) => setModo(e.target.checked ? 'corrigido' : 'planilha')} />
          Corrigir VT (sem VT negativo e sem VT em vaga sem salário)
        </label>
        {canEdit && cenario !== 'alta' && (
          <button onClick={() => duplicar(cenario, 'alta')} className="ml-auto flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
            <Copy className="w-3.5 h-3.5" /> Copiar para Alta
          </button>
        )}
      </div>
      {meses.length > 0 && <p className="text-xs text-slate-500">Meses neste cenário: {meses.map((m) => m.label).join(', ')}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Resumo titulo="Vagas" valor={fmtNum(resumo.quantidade)} />
        <Resumo titulo="Total (salário + encargos)" valor={formatCurrency(resumo.total_planilha)} />
        <Resumo titulo="Total c/ benefícios" valor={formatCurrency(resumo.total_com_beneficios)} />
        <Resumo titulo="Benefícios" valor={formatCurrency(resumo.beneficios)} />
      </div>

      <div className={cn(card, 'overflow-auto max-h-[70vh]')}>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {['Cargo', 'Salário', 'Adicional', 'Q. caixa', 'Sal. + adic.', 'FGTS', 'INSS', '13º', 'FGTS 13º', 'INSS 13º', 'Férias', '1/3 férias', 'FGTS fér.', 'INSS fér.', 'VT', 'Encargos', 'Premiação', 'Assid.', 'Boas prát.', 'Total', 'Qtd', ''].map((h) => (
                <th key={h} className={cn(th, h === 'Cargo' ? 'text-left min-w-[220px]' : 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {setores.map((setor) => {
              const doSetor = vagas.filter((v) => v.setor === setor);
              const sub = resumo.setores.find((s) => s.setor === setor);
              return (
                <React.Fragment key={setor}>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={19} className="px-3 py-1.5 font-bold text-slate-800">
                      {setor} <span className="font-normal text-slate-500">({fmtNum(sub?.quantidade ?? 0)})</span>
                      {canEdit && (
                        <button onClick={() => novaVaga(setor)} className="ml-3 text-xs font-normal text-sky-700 hover:underline">
                          + vaga
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">{formatCurrency(sub?.total_planilha ?? 0)}</td>
                    <td colSpan={2} />
                  </tr>
                  {doSetor.map((v) => {
                    const c = calcularCustoVaga(v, params, modo);
                    const cel = (x: number) => <td className="px-2 py-1 text-right tabular-nums text-slate-600">{fmt(x)}</td>;
                    return (
                      <tr key={v.id} className="border-t border-slate-100">
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            {c.alertas.length > 0 && (
                              <span title={c.alertas.join('\n')}>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              </span>
                            )}
                            <input
                              defaultValue={v.cargo}
                              disabled={!canEdit}
                              onBlur={(e) => e.target.value !== v.cargo && void salvarVaga(v.id, { cargo: e.target.value })}
                              className="w-full px-1 py-0.5 rounded border border-transparent hover:border-slate-200 bg-transparent"
                            />
                          </div>
                          {v.nome && <div className="pl-5 text-[10px] text-slate-400">{v.nome}</div>}
                        </td>
                        <td className="px-1 py-0.5"><InputCelula valor={v.salario} disabled={!canEdit} onSalvar={(x) => void salvarVaga(v.id, { salario: x ?? 0 })} /></td>
                        <td className="px-1 py-0.5"><InputCelula valor={v.adicional_fixo} disabled={!canEdit} onSalvar={(x) => void salvarVaga(v.id, { adicional_fixo: x ?? 0 })} /></td>
                        <td className="px-2 py-1 text-right">
                          <label className="inline-flex items-center gap-1 tabular-nums text-slate-600">
                            <input type="checkbox" checked={v.recebe_quebra_caixa} disabled={!canEdit} onChange={(e) => void salvarVaga(v.id, { recebe_quebra_caixa: e.target.checked })} />
                            {fmt(c.quebra_caixa)}
                          </label>
                        </td>
                        {cel(c.salario_adicionais)}
                        {cel(c.fgts)}
                        {cel(c.inss)}
                        {cel(c.decimo)}
                        {cel(c.fgts_13)}
                        {cel(c.inss_13)}
                        {cel(c.ferias)}
                        {cel(c.terco_ferias)}
                        {cel(c.fgts_ferias)}
                        {cel(c.inss_ferias)}
                        <td className={cn('px-2 py-1 text-right tabular-nums', c.vale_transporte < 0 ? 'text-red-600' : 'text-slate-600')}>{fmt(c.vale_transporte)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-800">
                          <label className="inline-flex items-center gap-1" title="Encargos zerados (ex.: terceirizado)">
                            {canEdit && <input type="checkbox" checked={!v.encargos_zerados} onChange={(e) => void salvarVaga(v.id, { encargos_zerados: !e.target.checked })} />}
                            {fmt(c.total_encargos)}
                          </label>
                        </td>
                        <td className="px-1 py-0.5"><InputCelula valor={v.premiacao} disabled={!canEdit} onSalvar={(x) => void salvarVaga(v.id, { premiacao: x ?? 0 })} /></td>
                        {cel(c.beneficio_assiduidade)}
                        {cel(c.beneficio_boas_praticas)}
                        <td className="px-2 py-1 text-right tabular-nums font-semibold text-slate-900" title={`Custo completo c/ benefícios: ${formatCurrency(c.total_com_beneficios)}`}>
                          {fmt(c.total_planilha)}
                        </td>
                        <td className="px-1 py-0.5 w-16"><InputCelula valor={v.quantidade} disabled={!canEdit} onSalvar={(x) => void salvarVaga(v.id, { quantidade: x ?? 0 })} /></td>
                        <td className="px-2 py-1">
                          {canEdit && (
                            <button onClick={() => excluirVaga(v.id)} className="text-slate-300 hover:text-red-600" aria-label="Excluir vaga">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {vagas.length === 0 && (
              <tr>
                <td colSpan={22} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma vaga neste cenário.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        Total = salário + adicionais + encargos (FGTS 8%, INSS 28,5%, 13º, férias e 1/3 com FGTS/INSS, VT = 220 − salário × 6%), como na planilha. Os subtotais e o total geral somam todas as vagas: na planilha original o setor Atrações ficava fora do total geral e o "total sem benefícios" descontava benefícios que não tinham sido somados.
      </p>
    </div>
  );
};

const Resumo: React.FC<{ titulo: string; valor: string }> = ({ titulo, valor }) => (
  <div className={cn(card, 'px-4 py-3')}>
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{titulo}</div>
    <div className="text-lg font-bold text-slate-900 tabular-nums">{valor}</div>
  </div>
);

// ─── Parâmetros ─────────────────────────────────────────────────────────────

const PARAMS_PCT: Array<[keyof AquaParametros, string]> = [
  ['aliq_iss', 'ISS'],
  ['aliq_icms', 'ICMS'],
  ['aliq_pis', 'PIS'],
  ['aliq_cofins', 'COFINS'],
  ['aliq_csll', 'CSLL (sobre faturamento)'],
  ['aliq_irpj', 'IRPJ (sobre faturamento)'],
  ['pct_cmv', 'CMV sobre A&B'],
  ['pct_comissao_cartao', 'Comissão vendas internet / cartão'],
  ['pct_influencer_base', 'Base comissão influencers'],
  ['pct_influencer', 'Comissão influencers'],
  ['pct_fgts', 'FGTS'],
  ['pct_inss', 'INSS patronal'],
  ['pct_13', '13º salário'],
  ['pct_ferias', 'Férias'],
  ['pct_terco_ferias', '1/3 de férias'],
  ['vt_pct_desconto', 'Desconto do VT no salário'],
  ['pct_quebra_caixa', 'Quebra de caixa'],
];
const PARAMS_VALOR: Array<[keyof AquaParametros, string]> = [
  ['valor_vale_alimentacao', 'Vale-alimentação por funcionário (R$)'],
  ['vt_base', 'VT base mensal (R$)'],
  ['beneficio_assiduidade', 'Benefício assiduidade (R$)'],
  ['beneficio_boas_praticas', 'Benefício boas práticas (R$)'],
];

const AbaParametros: React.FC<{
  dados: Dados;
  canEdit: boolean;
  setDados: React.Dispatch<React.SetStateAction<Dados | null>>;
  onErro: (m: string) => void;
  onSalvo: () => void;
}> = ({ dados, canEdit, setDados, onErro, onSalvo }) => {
  const [p, setP] = useState<AquaParametros>(dados.parametros);
  const [cal, setCal] = useState<Record<string, string>>(dados.calendario);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setP(dados.parametros), [dados.parametros]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api<{ parametros: AquaParametros }>(`/api/aqua/temporadas/${dados.temporada.id}/parametros`, { method: 'PUT', body: JSON.stringify({ valores: p }) });
      await api(`/api/aqua/temporadas/${dados.temporada.id}/calendario`, { method: 'PUT', body: JSON.stringify({ calendario: cal }) });
      setDados((d) => (d ? { ...d, parametros: r.parametros, calendario: cal } : d));
      onSalvo();
    } catch (e: any) {
      onErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const inp = 'w-28 px-2 py-1 rounded-lg border border-slate-200 text-right text-sm tabular-nums';
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <section className={cn(card, 'p-4 space-y-2')}>
          <h2 className="font-bold text-slate-800">Percentuais</h2>
          {PARAMS_PCT.map(([k, rotulo]) => (
            <label key={k} className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {rotulo}
              <span className="flex items-center gap-1">
                <InputPct valor={p[k] as number} disabled={!canEdit} onChange={(v) => setP({ ...p, [k]: v })} className={inp} />%
              </span>
            </label>
          ))}
        </section>
        <section className="space-y-4">
          <div className={cn(card, 'p-4 space-y-2')}>
            <h2 className="font-bold text-slate-800">Valores</h2>
            {PARAMS_VALOR.map(([k, rotulo]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                {rotulo}
                <input type="number" step="0.01" value={p[k] as number} disabled={!canEdit} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} className={inp} />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-700 pt-2">
              <input type="checkbox" checked={p.bar_inclui_passantes_ano_ant} disabled={!canEdit} onChange={(e) => setP({ ...p, bar_inclui_passantes_ano_ant: e.target.checked })} />
              Base do A&B Bar inclui passantes do ano anterior (como na planilha)
            </label>
          </div>
          <div className={cn(card, 'p-4 space-y-2')}>
            <h2 className="font-bold text-slate-800">Calendário do quadro</h2>
            <div className="grid grid-cols-3 gap-2">
              {dados.meses.map((m) => (
                <label key={m.key} className="flex items-center justify-between gap-1 text-sm text-slate-700">
                  {m.label}
                  <select value={cal[m.key] ?? 'fechado'} disabled={!canEdit} onChange={(e) => setCal({ ...cal, [m.key]: e.target.value })} className="px-1 py-1 rounded-lg border border-slate-200 text-xs">
                    <option value="alta">Alta</option>
                    <option value="baixa">Baixa</option>
                    <option value="fechado">Fechado</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className={cn(card, 'p-4 space-y-2')}>
            <h2 className="font-bold text-slate-800">Requisições</h2>
            <ListaParam rotulo="Grupos de itens = Uso e Consumo" valor={p.req_grupos_uso_consumo} disabled={!canEdit} onChange={(v) => setP({ ...p, req_grupos_uso_consumo: v.map(Number).filter(Number.isFinite) })} />
            <ListaParam rotulo="Grupos de itens = CMV" valor={p.req_grupos_cmv} disabled={!canEdit} onChange={(v) => setP({ ...p, req_grupos_cmv: v.map(Number).filter(Number.isFinite) })} />
            <ListaParam rotulo="Setores de consumo interno" valor={p.setores_consumo_interno} disabled={!canEdit} onChange={(v) => setP({ ...p, setores_consumo_interno: v })} />
          </div>
        </section>
      </div>
      {canEdit && (
        <div className="flex justify-end gap-2">
          <button onClick={() => setP({ ...AQUA_PARAMETROS_PADRAO })} className="px-4 py-2 rounded-xl border border-slate-200 text-sm">
            Restaurar padrão da planilha
          </button>
          <button onClick={salvar} disabled={salvando} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50">
            <Save className="w-4 h-4" /> Salvar parâmetros
          </button>
        </div>
      )}
    </div>
  );
};

const InputPct: React.FC<{ valor: number; onChange: (v: number) => void; disabled?: boolean; className?: string }> = ({ valor, onChange, disabled, className }) => {
  const [txt, setTxt] = useState(fmtNum(+(valor * 100).toFixed(6)));
  useEffect(() => setTxt(fmtNum(+(valor * 100).toFixed(6))), [valor]);
  return (
    <input
      value={txt}
      disabled={disabled}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const n = parseNum(txt);
        if (n !== null) onChange(n / 100);
      }}
      className={className}
      inputMode="decimal"
    />
  );
};

const ListaParam: React.FC<{ rotulo: string; valor: Array<string | number>; onChange: (v: string[]) => void; disabled?: boolean }> = ({ rotulo, valor, onChange, disabled }) => (
  <label className="block text-xs font-semibold text-slate-600">
    {rotulo}
    <input
      defaultValue={valor.join(', ')}
      disabled={disabled}
      onBlur={(e) => onChange(e.target.value.split(/[,;]/).map((s) => s.trim()).filter(Boolean))}
      className="w-full mt-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-normal"
    />
  </label>
);

// ─── Estrutura ──────────────────────────────────────────────────────────────

const AbaEstrutura: React.FC<{
  dados: Dados;
  setDados: React.Dispatch<React.SetStateAction<Dados | null>>;
  onErro: (m: string) => void;
}> = ({ dados, setDados, onErro }) => {
  const [filtro, setFiltro] = useState('');
  const porId = new Map(dados.linhas.map((l) => [Number(l.id), l]));
  const profundidade = (l: AquaLinha) => {
    let d = 0;
    let p = l.parent_id ? porId.get(Number(l.parent_id)) : undefined;
    while (p && d < 10) {
      d++;
      p = p.parent_id ? porId.get(Number(p.parent_id)) : undefined;
    }
    return d;
  };
  const ordenadas = useMemo(() => {
    const filhos = new Map<number | null, AquaLinha[]>();
    for (const l of dados.linhas) {
      const k = l.parent_id ? Number(l.parent_id) : null;
      if (!filhos.has(k)) filhos.set(k, []);
      filhos.get(k)!.push(l);
    }
    const out: AquaLinha[] = [];
    const visit = (k: number | null) => {
      for (const l of (filhos.get(k) ?? []).sort((a, b) => a.ordem - b.ordem)) {
        out.push(l);
        visit(Number(l.id));
      }
    };
    visit(null);
    return out;
  }, [dados.linhas]);

  const salvar = async (id: number, patch: Partial<AquaLinha>) => {
    setDados((d) => (d ? { ...d, linhas: d.linhas.map((l) => (Number(l.id) === id ? { ...l, ...patch } : l)) } : d));
    try {
      await api(`/api/aqua/linhas/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (e: any) {
      onErro(e.message);
    }
  };
  const adicionar = async (parent: AquaLinha) => {
    const rotulo = window.prompt(`Nova conta dentro de "${parent.rotulo}" (ex.: NOVA CONTA (999))`);
    if (!rotulo) return;
    try {
      const r = await api<{ linha: AquaLinha }>(`/api/aqua/temporadas/${dados.temporada.id}/linhas`, {
        method: 'POST',
        body: JSON.stringify({
          parent_id: parent.id,
          rotulo,
          tipo: 'conta',
          bloco: parent.bloco,
          grupo: parent.grupo,
          subgrupo: parent.subgrupo ?? parent.rotulo,
          ordem: Math.max(parent.ordem, ...dados.linhas.filter((x) => Number(x.parent_id) === Number(parent.id)).map((x) => x.ordem)) + 1,
          regra_previsto: 'manual',
          regra_realizado: 'crd',
        }),
      });
      setDados((d) => (d ? { ...d, linhas: [...d.linhas, r.linha] } : d));
    } catch (e: any) {
      onErro(e.message);
    }
  };
  const excluir = async (l: AquaLinha) => {
    if (!window.confirm(`Excluir "${l.rotulo}" e as linhas abaixo dela? Os valores digitados serão perdidos.`)) return;
    try {
      await api(`/api/aqua/linhas/${l.id}`, { method: 'DELETE' });
      const r = await api<Dados>(`/api/aqua/temporadas/${dados.temporada.id}/dados`);
      setDados(r);
    } catch (e: any) {
      onErro(e.message);
    }
  };

  const sel = 'px-1 py-1 rounded-lg border border-slate-200 text-xs bg-white';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Define de onde vem o previsto e o realizado de cada linha. A chave do realizado é o código da conta (Rel. CRD), o ambiente (Vendas), o setor (Requisições) ou os grupos de itens, separados por "|".</p>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar..." className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm" />
      </div>
      <div className={cn(card, 'overflow-auto max-h-[75vh]')}>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className={cn(th, 'text-left min-w-[300px]')}>Linha</th>
              <th className={cn(th, 'text-left')}>Bloco</th>
              <th className={cn(th, 'text-left')}>Pessoal</th>
              <th className={cn(th, 'text-left')}>Previsto</th>
              <th className={cn(th, 'text-left')}>Realizado</th>
              <th className={cn(th, 'text-left')}>Chave do realizado</th>
              <th className={cn(th, 'text-center')}>Ativa</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordenadas
              .filter((l) => !filtro || l.rotulo.toLowerCase().includes(filtro.toLowerCase()))
              .map((l) => {
                const id = Number(l.id);
                return (
                  <tr key={id} className={cn('border-t border-slate-100', !l.ativo && 'opacity-50')}>
                    <td className="px-2 py-1">
                      <input
                        defaultValue={l.rotulo}
                        onBlur={(e) => e.target.value !== l.rotulo && void salvar(id, { rotulo: e.target.value })}
                        style={{ marginLeft: profundidade(l) * 14 }}
                        className={cn('px-1 py-0.5 rounded border border-transparent hover:border-slate-200 bg-transparent w-[90%]', l.tipo !== 'conta' && l.tipo !== 'centro_custo' && 'font-bold')}
                      />
                    </td>
                    <td className="px-2 py-1 text-slate-500">{AQUA_BLOCOS.find((b) => b.bloco === l.bloco)?.rotulo ?? l.bloco}</td>
                    <td className="px-2 py-1">
                      <select value={l.sintese_pessoal ?? ''} onChange={(e) => void salvar(id, { sintese_pessoal: (e.target.value || null) as any })} className={sel}>
                        <option value="">—</option>
                        <option value="Pessoal">Pessoal</option>
                        <option value="Extras">Extras</option>
                        <option value="Benefícios">Benefícios</option>
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select value={l.regra_previsto} onChange={(e) => void salvar(id, { regra_previsto: e.target.value })} className={sel} title={DESCRICAO_REGRA_PREVISTO[l.regra_previsto as keyof typeof DESCRICAO_REGRA_PREVISTO]}>
                        {REGRAS_PREVISTO.map((r) => (
                          <option key={r} value={r}>
                            {DESCRICAO_REGRA_PREVISTO[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select value={l.regra_realizado} onChange={(e) => void salvar(id, { regra_realizado: e.target.value })} className={sel}>
                        {REGRAS_REALIZADO.map((r) => (
                          <option key={r} value={r}>
                            {DESCRICAO_REGRA_REALIZADO[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        defaultValue={l.chave_realizado ?? ''}
                        onBlur={(e) => (e.target.value || null) !== l.chave_realizado && void salvar(id, { chave_realizado: e.target.value || null })}
                        className="w-48 px-2 py-1 rounded-lg border border-slate-200"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={l.ativo !== false} onChange={(e) => void salvar(id, { ativo: e.target.checked })} />
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {l.tipo !== 'conta' && l.tipo !== 'centro_custo' && (
                        <button onClick={() => adicionar(l)} className="text-sky-700 hover:underline mr-2" title="Adicionar conta dentro desta linha">
                          <Plus className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                      <button onClick={() => excluir(l)} className="text-slate-300 hover:text-red-600" aria-label="Excluir linha">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Regras calculadas disponíveis: {[...REGRAS_SINTESE].join(', ')}, csll, irpj, folha_quadro.</p>
    </div>
  );
};

// ─── Importação ─────────────────────────────────────────────────────────────

type Preview = {
  temporada: { nome: string };
  linhas: number;
  valores: number;
  vagas: number;
  avisos: string[];
  conferencia: {
    divergencias_previsto: number;
    resultado_previsto_sistema: number;
    resultado_previsto_planilha: number;
    quadro_totais_planilha: Record<string, number>;
  };
};

const ImportarModal: React.FC<{ onClose: () => void; onImportado: (t: Temporada) => void }> = ({ onClose, onImportado }) => {
  const [dadosFile, setDadosFile] = useState<File | null>(null);
  const [quadroFile, setQuadroFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const form = () => {
    const fd = new FormData();
    if (dadosFile) fd.append('dados', dadosFile);
    if (quadroFile) fd.append('quadro', quadroFile);
    fd.append('substituir', String(substituir));
    return fd;
  };
  const conferir = async () => {
    setBusy(true);
    setErro(null);
    try {
      setPreview(await api<Preview>('/api/aqua/import/preview', { method: 'POST', body: form() }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  };
  const importar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const r = await api<{ temporada: Temporada }>('/api/aqua/import/commit', { method: 'POST', body: form() });
      onImportado(r.temporada);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="font-bold text-slate-900">Importar planilhas do orçamento</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <label className="block text-xs font-semibold text-slate-600">
          "Aquamania Dados para Orçamento" (.xlsx) — Síntese + Prev x Real
          <input type="file" accept=".xlsx" onChange={(e) => { setDadosFile(e.target.files?.[0] ?? null); setPreview(null); }} className="block mt-1 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          "Quadro de Empregados" (.xlsx) — opcional
          <input type="file" accept=".xlsx" onChange={(e) => { setQuadroFile(e.target.files?.[0] ?? null); setPreview(null); }} className="block mt-1 text-sm" />
        </label>
        {preview && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
            <div>
              Temporada <b>{preview.temporada.nome}</b>: {preview.linhas} linhas, {preview.valores} valores, {preview.vagas} vagas.
            </div>
            <div className={preview.conferencia.divergencias_previsto ? 'text-red-600' : 'text-emerald-700'}>
              {preview.conferencia.divergencias_previsto
                ? `${preview.conferencia.divergencias_previsto} células do previsto não bateram com a planilha.`
                : 'Previsto recalculado pelo sistema bate 100% com a planilha.'}
            </div>
            <div>
              Resultado previsto da temporada: sistema {formatCurrency(preview.conferencia.resultado_previsto_sistema)} × planilha {formatCurrency(preview.conferencia.resultado_previsto_planilha)}
            </div>
            {preview.avisos.map((a) => (
              <div key={a} className="text-amber-700 text-xs">
                • {a}
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
          Substituir a temporada se ela já existir (apaga edições feitas no sistema)
        </label>
        {erro && <div className="text-sm text-red-600">{erro}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={conferir} disabled={!dadosFile || busy} className="px-4 py-2 rounded-xl border border-slate-200 text-sm disabled:opacity-50">
            Conferir
          </button>
          <button onClick={importar} disabled={!dadosFile || busy || !preview} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm disabled:opacity-50">
            <Upload className="w-4 h-4" /> Importar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AquaOrcamentoPage;
