import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  FileSpreadsheet,
  FunctionSquare,
  Link2,
  ArrowUpRight,
  ExternalLink,
  Info,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  PLANILHAS,
  PlanilhaData,
  PlanilhaCelula,
  PlanilhaDependencia,
  findPlanilhaByNome,
  colLetter,
  parseCellRef,
  FORMULA_DESCRIPTIONS,
  TIPO_FORMULA_LABELS,
} from '../lib/planilhas';

const ROW_H = 30;
const COL_W = 132;
const ROWNUM_W = 52;
const OVERSCAN = 8;

// Cache em memória para não rebaixar o mesmo JSON ao navegar entre abas.
const sheetCache = new Map<number, PlanilhaData>();

interface PlanilhasPageProps {
  indice: number;
  targetCell?: string | null;
  onNavigate: (indice: number, cell?: string) => void;
}

type CellPos = { row: number; col: number };

const displayValue = (cell?: PlanilhaCelula): string => {
  if (!cell) return '';
  const v = cell.formula !== undefined ? cell.valorCalculado ?? cell.valor : cell.valor ?? cell.valorCalculado;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v);
};

const isErrorValue = (v: string) => v.startsWith('#');

const isNumericCell = (cell?: PlanilhaCelula): boolean => {
  if (!cell) return false;
  if (cell.tipoValor === 'number') return true;
  return typeof cell.valorReal === 'number';
};

interface RowProps {
  rowIdx: number;
  totalColunas: number;
  rowCells: Map<number, PlanilhaCelula> | undefined;
  selectedCol: number | null;
  onCellClick: (row: number, col: number) => void;
}

const SheetRow = React.memo<RowProps>(({ rowIdx, totalColunas, rowCells, selectedCol, onCellClick }) => {
  const cells = [];
  for (let col = 1; col <= totalColunas; col++) {
    const cell = rowCells?.get(col);
    const value = displayValue(cell);
    const hasFormula = cell?.formula !== undefined;
    const isError = isErrorValue(value);
    const isSelected = selectedCol === col;
    cells.push(
      <button
        key={col}
        onClick={() => onCellClick(rowIdx, col)}
        title={cell ? `${cell.celula}${cell.formula ? `\n${cell.formula}` : ''}` : `${colLetter(col)}${rowIdx}`}
        className={cn(
          'h-full border-b border-r border-slate-100 px-2 text-xs truncate text-left focus:outline-none',
          hasFormula && !isError && 'bg-emerald-50/70 text-emerald-950',
          isError && 'bg-red-50 text-red-500',
          !hasFormula && !isError && 'bg-white text-slate-700',
          isNumericCell(cell) && 'text-right tabular-nums',
          isSelected && 'ring-2 ring-inset ring-emerald-500 bg-emerald-100'
        )}
        style={{ width: COL_W, minWidth: COL_W }}
      >
        {value}
      </button>
    );
  }

  return (
    <div className="flex" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-10 flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400"
        style={{ width: ROWNUM_W, minWidth: ROWNUM_W }}
      >
        {rowIdx}
      </div>
      {cells}
    </div>
  );
});
SheetRow.displayName = 'SheetRow';

export const PlanilhasPage: React.FC<PlanilhasPageProps> = ({ indice, targetCell, onNavigate }) => {
  const meta = PLANILHAS.find((p) => p.indice === indice) ?? PLANILHAS[0];
  const [data, setData] = useState<PlanilhaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CellPos | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(560);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Carrega o JSON da aba (com cache em memória).
  useEffect(() => {
    let cancelled = false;
    setSelected(null);
    setScrollTop(0);
    setError('');

    const cached = sheetCache.get(meta.indice);
    if (cached) {
      setData(cached);
      setLoading(false);
      if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, left: 0 });
      return;
    }

    setLoading(true);
    setData(null);
    fetch(`/api/planilhas/${meta.arquivo}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Falha ao carregar (${res.status})`);
        return res.json();
      })
      .then((json: PlanilhaData) => {
        if (cancelled) return;
        sheetCache.set(meta.indice, json);
        setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar a planilha.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [meta.indice, meta.arquivo]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight || 560);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [data]);

  // Mapa linha -> (coluna -> célula) para acesso O(1) durante a renderização.
  const cellMap = useMemo(() => {
    const map = new Map<number, Map<number, PlanilhaCelula>>();
    if (!data) return map;
    for (const cell of data.celulas) {
      let row = map.get(cell.linha);
      if (!row) {
        row = new Map();
        map.set(cell.linha, row);
      }
      row.set(cell.coluna, cell);
    }
    return map;
  }, [data]);

  const tipoFormulaStats = useMemo(() => {
    const stats: Record<string, number> = {};
    if (!data) return stats;
    for (const cell of data.celulas) {
      if (cell.tipoFormula) stats[cell.tipoFormula] = (stats[cell.tipoFormula] || 0) + 1;
    }
    return stats;
  }, [data]);

  // Dependências externas agrupadas por aba de destino.
  const externalDeps = useMemo(() => {
    const groups = new Map<string, PlanilhaDependencia[]>();
    for (const dep of data?.resumo?.dependenciasExternas ?? []) {
      const key = dep.abaDestino || 'Desconhecida';
      const list = groups.get(key) ?? [];
      list.push(dep);
      groups.set(key, list);
    }
    return groups;
  }, [data]);

  const scrollToCell = useCallback((pos: CellPos) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: Math.max(0, (pos.row - 1) * ROW_H - el.clientHeight / 3),
      left: Math.max(0, (pos.col - 1) * COL_W - el.clientWidth / 3),
      behavior: 'smooth',
    });
  }, []);

  const selectCell = useCallback(
    (pos: CellPos) => {
      setSelected(pos);
      scrollToCell(pos);
    },
    [scrollToCell]
  );

  // Quando outra aba "chama" esta (navegação via dependência), foca a célula alvo.
  useEffect(() => {
    if (!data || !targetCell) return;
    const pos = parseCellRef(targetCell);
    if (pos) selectCell(pos);
  }, [data, targetCell, selectCell]);

  const handleCellClick = useCallback((row: number, col: number) => {
    setSelected({ row, col });
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Navega para a aba referenciada por uma dependência (conversa entre abas).
  const openDependency = useCallback(
    (dep: PlanilhaDependencia) => {
      if (!dep.abaDestino) return;
      const target = findPlanilhaByNome(dep.abaDestino);
      if (target) onNavigate(target.indice, dep.celula);
    },
    [onNavigate]
  );

  const selectedCell = selected ? cellMap.get(selected.row)?.get(selected.col) : undefined;
  const selectedRef = selected ? `${colLetter(selected.col)}${selected.row}` : '';

  const totalLinhas = data?.totalLinhas ?? 0;
  const totalColunas = data?.totalColunas ?? 0;

  const startRow = Math.max(1, Math.floor(scrollTop / ROW_H) - OVERSCAN + 1);
  const visibleCount = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const endRow = Math.min(totalLinhas, startRow + visibleCount);

  const rows = [];
  if (data) {
    for (let r = startRow; r <= endRow; r++) {
      rows.push(
        <SheetRow
          key={r}
          rowIdx={r}
          totalColunas={totalColunas}
          rowCells={cellMap.get(r)}
          selectedCol={selected?.row === r ? selected.col : null}
          onCellClick={handleCellClick}
        />
      );
    }
  }

  const formulasUsadas = (Object.entries(data?.resumo?.formulasUsadas ?? {}) as [string, number][]).sort(
    (a, b) => b[1] - a[1]
  );
  const totalWidth = ROWNUM_W + totalColunas * COL_W;

  return (
    <div className="space-y-6">
      {/* Cabeçalho da aba */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#004D40] text-emerald-300 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{meta.nome}</h2>
            <p className="text-sm text-slate-500">
              Planilhas · réplica da aba original importada de <span className="font-mono text-xs">{meta.arquivo}</span>
            </p>
          </div>
        </div>

        {data && (
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
              {totalLinhas.toLocaleString('pt-BR')} linhas × {totalColunas} colunas
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
              {data.celulas.length.toLocaleString('pt-BR')} células
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
              <FunctionSquare className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              {data.resumo.totalCelulasComFormula.toLocaleString('pt-BR')} fórmulas
            </span>
            {externalDeps.size > 0 && (
              <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-700">
                <Link2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                conversa com {externalDeps.size} aba{externalDeps.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Barra de fórmulas */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 min-h-[52px]">
        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-bold text-slate-600 font-mono min-w-[52px] text-center">
          {selectedRef || '—'}
        </span>
        <span className="text-slate-300 font-bold italic">fx</span>
        {selectedCell ? (
          <>
            <code className="text-xs text-slate-800 font-mono break-all flex-1 min-w-[200px]">
              {selectedCell.formula ?? displayValue(selectedCell) ?? ''}
            </code>
            {selectedCell.formula && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-700">
                = {displayValue(selectedCell) || '(vazio)'}
              </span>
            )}
            {selectedCell.tipoFormula && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-500">
                {TIPO_FORMULA_LABELS[selectedCell.tipoFormula] ?? selectedCell.tipoFormula}
              </span>
            )}
            {(selectedCell.dependencias ?? []).map((dep, i) =>
              dep.tipo === 'local' ? (
                (dep.celulas ?? []).slice(0, 8).map((ref) => {
                  const pos = parseCellRef(ref);
                  return (
                    <button
                      key={`${i}-${ref}`}
                      onClick={() => pos && selectCell(pos)}
                      className="px-2 py-1 rounded-lg bg-blue-50 border border-blue-100 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                      title={`Ir para a célula ${ref}`}
                    >
                      {ref}
                    </button>
                  );
                })
              ) : (
                <button
                  key={i}
                  onClick={() => openDependency(dep)}
                  disabled={!dep.abaDestino || !findPlanilhaByNome(dep.abaDestino)}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1',
                    dep.abaDestino && findPlanilhaByNome(dep.abaDestino)
                      ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                      : 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed'
                  )}
                  title={
                    dep.abaDestino && findPlanilhaByNome(dep.abaDestino)
                      ? `Abrir ${dep.referencia}`
                      : 'Referência a planilha externa (fora deste arquivo)'
                  }
                >
                  {dep.abaDestino && findPlanilhaByNome(dep.abaDestino) ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ExternalLink className="w-3 h-3" />
                  )}
                  {dep.referencia ?? `${dep.abaDestino}!${dep.celula}`}
                </button>
              )
            )}
          </>
        ) : (
          <span className="text-xs text-slate-400">
            Clique em uma célula para ver a fórmula, o valor calculado e as dependências.
          </span>
        )}
      </div>

      {/* Grade da planilha */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="h-[420px] flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm font-medium">Carregando {meta.nome}...</p>
            <p className="text-xs">Abas grandes podem levar alguns segundos.</p>
          </div>
        ) : error ? (
          <div className="h-[420px] flex flex-col items-center justify-center gap-2 text-red-500">
            <p className="text-sm font-bold">Não foi possível carregar a planilha.</p>
            <p className="text-xs">{error}</p>
          </div>
        ) : !data || totalLinhas === 0 ? (
          <div className="h-[320px] flex flex-col items-center justify-center gap-2 text-slate-400">
            <FileSpreadsheet className="w-10 h-10" />
            <p className="text-sm font-medium">Esta aba está vazia na planilha original.</p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-auto"
            style={{ height: 'min(62vh, 640px)' }}
          >
            <div style={{ width: totalWidth }}>
              {/* Cabeçalho com letras das colunas */}
              <div className="sticky top-0 z-20 flex bg-slate-100" style={{ height: ROW_H }}>
                <div
                  className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-100"
                  style={{ width: ROWNUM_W, minWidth: ROWNUM_W }}
                />
                {Array.from({ length: totalColunas }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-center border-b border-r border-slate-200 text-[10px] font-bold uppercase',
                      selected?.col === i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    )}
                    style={{ width: COL_W, minWidth: COL_W }}
                  >
                    {colLetter(i + 1)}
                  </div>
                ))}
              </div>

              {/* Janela virtualizada de linhas */}
              <div style={{ height: (startRow - 1) * ROW_H }} />
              {rows}
              <div style={{ height: Math.max(0, totalLinhas - endRow) * ROW_H }} />
            </div>
          </div>
        )}
      </div>

      {/* Legenda rápida */}
      {data && data.resumo.totalCelulasComFormula > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 inline-block" />
            célula com fórmula (valor calculado)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white border border-slate-200 inline-block" />
            valor digitado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" />
            erro na planilha original (ex.: #REF! de IMPORTRANGE sem acesso)
          </span>
        </div>
      )}

      {/* Conexões com outras abas */}
      {data && externalDeps.size > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-500" />
            Conversa entre abas
          </h3>
          <p className="text-xs text-slate-500">
            Esta aba referencia células de outras abas/planilhas. Clique para abrir a aba de origem já na célula
            referenciada.
          </p>
          <div className="space-y-2">
            {Array.from(externalDeps.entries()).map(([destino, deps]) => {
              const target = findPlanilhaByNome(destino);
              return (
                <div key={destino} className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold',
                      target ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {destino}
                    {!target && ' (planilha externa)'}
                  </span>
                  {deps.slice(0, 12).map((dep, i) => (
                    <button
                      key={i}
                      onClick={() => openDependency(dep)}
                      disabled={!target}
                      className={cn(
                        'px-2 py-1 rounded-lg text-[11px] font-mono transition-colors',
                        target
                          ? 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
                          : 'bg-slate-50 border border-slate-100 text-slate-400 cursor-not-allowed'
                      )}
                    >
                      {dep.celula}
                    </button>
                  ))}
                  {deps.length > 12 && (
                    <span className="text-[11px] text-slate-400">+{deps.length - 12} referências</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rodapé: explicação das fórmulas */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <FunctionSquare className="w-4 h-4 text-emerald-600" />
          Entendendo as fórmulas desta aba
        </h3>

        {formulasUsadas.length === 0 ? (
          <p className="text-xs text-slate-500">
            Esta aba não utiliza funções de planilha — contém apenas valores digitados
            {data && data.resumo.totalCelulasComFormula > 0
              ? ' e referências diretas a células de outras abas (ex.: =Síntese!C48).'
              : '.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {formulasUsadas.map(([fn, count]) => {
              const info = FORMULA_DESCRIPTIONS[fn];
              return (
                <div key={fn} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 font-mono">{fn}</span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {count.toLocaleString('pt-BR')} uso{count > 1 ? 's' : ''}
                    </span>
                  </div>
                  {info && (
                    <>
                      <code className="block mt-1 text-[10px] text-emerald-700 font-mono">{info.sintaxe}</code>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{info.descricao}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {Object.keys(tipoFormulaStats).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {(Object.entries(tipoFormulaStats) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([tipo, count]) => (
                <span
                  key={tipo}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-medium text-slate-600"
                >
                  {TIPO_FORMULA_LABELS[tipo] ?? tipo}: <b>{count.toLocaleString('pt-BR')}</b>
                </span>
              ))}
          </div>
        )}

        <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p>
            Os valores exibidos são os <b>valores calculados na última extração</b> da planilha original do Google
            Sheets — as fórmulas estão preservadas célula a célula e podem ser inspecionadas clicando em cada uma.
            Referências do tipo <code className="font-mono">'Aba'!Célula</code> entre as abas deste arquivo são
            navegáveis; referências via <code className="font-mono">IMPORTRANGE</code> apontam para outros arquivos
            do Google e aparecem como <code className="font-mono">#REF!</code> quando o acesso não foi autorizado na
            origem.
          </p>
        </div>
      </div>
    </div>
  );
};
