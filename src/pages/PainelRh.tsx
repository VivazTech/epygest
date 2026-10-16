import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Minus,
  RefreshCcw,
  Users,
  Wallet,
  X,
  Coins,
  Save,
  Landmark,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { canViewEmprestimosConfidenciais } from '../lib/emprestimosAccess';
import type { RolePermissionRow } from '../lib/permissionCatalog';
import type { FolhaComposicaoLinha, FolhaPainelResponse, TaxaServicoAnalise, FgtsAnalise } from '../lib/folhaPainel';

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const formatPct = (pct: number | null | undefined) => {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
};

const StatusBadge: React.FC<{ acima: boolean; label: string; compact?: boolean }> = ({
  acima,
  label,
  compact,
}) => {
  const noOrcamento = label === 'NO ORÇAMENTO';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-lg',
        compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1',
        noOrcamento
          ? 'bg-slate-100 text-slate-600'
          : acima
            ? 'bg-red-100 text-red-700'
            : 'bg-emerald-100 text-emerald-800'
      )}
    >
      {noOrcamento ? (
        <Minus className="w-3 h-3" />
      ) : acima ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {compact ? (acima ? 'Acima' : noOrcamento ? 'No orç.' : 'Abaixo') : label}
    </span>
  );
};

const BarCompare: React.FC<{ orcado: number; realizado: number }> = ({ orcado, realizado }) => {
  const max = Math.max(orcado, realizado, 1);
  const pctOrcado = (orcado / max) * 100;
  const pctRealizado = (realizado / max) * 100;
  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <span className="w-16 shrink-0">Orçado</span>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-slate-400 rounded-full" style={{ width: `${pctOrcado}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <span className="w-16 shrink-0">Realizado</span>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full',
              realizado > orcado + 0.01 ? 'bg-red-500' : 'bg-emerald-600'
            )}
            style={{ width: `${pctRealizado}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const ComposicaoLinhaRow: React.FC<{
  linha: FolhaComposicaoLinha;
  depth?: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}> = ({ linha, depth = 0, expanded, onToggle }) => {
  const hasChildren = (linha.children?.length ?? 0) > 0 || (linha.itens?.length ?? 0) > 0;
  const isOpen = expanded.has(linha.key);
  const isTotal = linha.tipo === 'total';
  const isGrupo = linha.tipo === 'grupo';
  const showPlusPrefix = depth === 0 && isGrupo && linha.key !== 'salario_bruto' && linha.key !== 'taxa_servico';

  return (
    <div className={cn(isTotal && 'border-t-2 border-[#004D40] mt-2 pt-2')}>
      <button
        type="button"
        disabled={!hasChildren}
        onClick={() => hasChildren && onToggle(linha.key)}
        className={cn(
          'w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors',
          hasChildren && 'hover:bg-slate-50 cursor-pointer',
          !hasChildren && 'cursor-default',
          isTotal && 'bg-emerald-50/50'
        )}
        style={{ paddingLeft: `${16 + depth * 16}px` }}
      >
        <span className="w-4 shrink-0 text-slate-400">
          {hasChildren ? (
            isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : null}
        </span>
        <span
          className={cn(
            'flex-1 text-sm',
            isTotal ? 'font-extrabold text-[#004D40]' : isGrupo ? 'font-bold text-slate-800' : 'text-slate-600'
          )}
        >
          {showPlusPrefix ? '+ ' : depth > 0 ? '· ' : ''}
          {linha.label}
        </span>
        <span
          className={cn(
            'text-sm tabular-nums font-bold shrink-0',
            isTotal ? 'text-[#004D40] text-base' : linha.valor < 0 ? 'text-red-600' : 'text-slate-900'
          )}
        >
          {linha.valor < 0 ? '−' : ''}
          {formatCurrency(Math.abs(linha.valor))}
        </span>
        {!isTotal && Math.abs(linha.valor) >= 0.01 && (
          <span className="text-[10px] tabular-nums text-slate-400 w-12 text-right shrink-0">
            {linha.pct.toFixed(1)}%
          </span>
        )}
      </button>

      {isOpen && linha.children?.map((child) => (
        <ComposicaoLinhaRow
          key={child.key}
          linha={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}

      {isOpen &&
        linha.itens?.map((item, idx) => (
          <div
            key={`${linha.key}-item-${idx}`}
            className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-50/50"
            style={{ paddingLeft: `${32 + depth * 16}px` }}
          >
            <span className="w-4 shrink-0" />
            <span className="flex-1 truncate">
              {item.codigo && <span className="text-slate-400 tabular-nums mr-1">{item.codigo}</span>}
              {item.nome}
            </span>
            <span className="tabular-nums font-medium text-slate-700">{formatCurrency(item.valor)}</span>
          </div>
        ))}
    </div>
  );
};

const ComposicaoCustoPanel: React.FC<{
  composicao: NonNullable<FolhaPainelResponse['composicao']>;
}> = ({ composicao }) => {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(composicao.grupos.filter((g) => g.tipo === 'grupo').map((g) => g.key))
  );

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Custo da folha</h3>
        <p className="text-xs text-slate-500 mt-0.5">{composicao.fonte}</p>
      </div>
      <div className="divide-y divide-slate-50 max-h-[560px] overflow-auto">
        {composicao.grupos.map((linha) => (
          <ComposicaoLinhaRow key={linha.key} linha={linha} expanded={expanded} onToggle={toggle} />
        ))}
      </div>
    </div>
  );
};

const TaxaServicoPanel: React.FC<{
  taxa: TaxaServicoAnalise;
  folhaOrcado: number;
  folhaRealizado: number;
  folhaDiferenca: number;
  year: string;
  month: string;
  onSaved: () => void;
}> = ({ taxa, folhaOrcado, folhaRealizado, folhaDiferenca, year, month, onSaved }) => {
  const [orcadoEdit, setOrcadoEdit] = useState(String(taxa.orcado_bruto || ''));
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setOrcadoEdit(String(taxa.orcado_bruto || ''));
  }, [taxa.orcado_bruto]);

  const salvarOrcado = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/folha/taxa-servico', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          orcado_bruto: Number(orcadoEdit) || 0,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Falha ao salvar orçado da taxa.');
      }
      onSaved();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const coberturaCredito =
    taxa.credito_rds != null && taxa.credito_rds > 0
      ? (taxa.realizado_bruto / taxa.credito_rds) * 100
      : null;

  return (
    <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-4 py-3 border-b border-amber-50 bg-amber-50/60 flex items-center justify-between gap-2 text-left hover:bg-amber-50"
      >
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-amber-700" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">Taxa de serviço</h3>
            <p className="text-xs text-slate-500">Crédito, custo com encargos e impacto no desvio da folha</p>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Crédito (RDS)</p>
              <p className="text-lg font-extrabold tabular-nums text-slate-900 mt-1">
                {taxa.credito_rds != null ? formatCurrency(taxa.credito_rds) : '—'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1 truncate">{taxa.credito_fonte}</p>
              {coberturaCredito != null && (
                <p className="text-[10px] text-amber-800 mt-1">
                  Folha consome {coberturaCredito.toFixed(1)}% do crédito
                </p>
              )}
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Taxa bruta (folha)</p>
              <p className="text-lg font-extrabold tabular-nums text-slate-900 mt-1">
                {formatCurrency(taxa.realizado_bruto)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">{taxa.rubricas.length} rubrica(s)</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custo taxa (c/ encargos)</p>
              <p className="text-lg font-extrabold tabular-nums text-slate-900 mt-1">
                {formatCurrency(taxa.custo_realizado)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                +{formatCurrency(taxa.incidencias_realizado.encargos_total)} enc. · +{' '}
                {formatCurrency(taxa.incidencias_realizado.provisoes_total)} prov.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Impacto no desvio</p>
              <p
                className={cn(
                  'text-lg font-extrabold tabular-nums mt-1',
                  taxa.impacto_no_desvio_folha > 0.009 ? 'text-red-600' : 'text-emerald-700'
                )}
              >
                {taxa.impacto_no_desvio_folha >= 0 ? '+' : ''}
                {formatCurrency(taxa.impacto_no_desvio_folha)}
              </p>
              <p className="text-[10px] text-slate-600 mt-1">
                {formatPct(taxa.pct_impacto_desvio_folha)} do desvio total (
                {formatCurrency(folhaDiferenca)})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-2 bg-slate-50/80 text-xs font-bold text-slate-600 uppercase tracking-wider">
              Explicação do desvio da folha
            </div>
            <div className="divide-y divide-slate-50 text-sm">
              {[
                { label: 'Orçado folha', valor: folhaOrcado, bold: false },
                { label: 'Realizado folha', valor: folhaRealizado, bold: false },
                { label: 'Desvio total', valor: folhaDiferenca, bold: true, highlight: true },
                { label: '↳ Explicado pela taxa de serviço', valor: taxa.impacto_no_desvio_folha, bold: true, taxa: true },
                { label: '↳ Demais fatores', valor: taxa.desvio_restante, bold: false },
              ].map((row) => (
                <div
                  key={row.label}
                  className={cn(
                    'flex items-center justify-between px-4 py-2.5',
                    row.highlight && 'bg-slate-50/50',
                    row.taxa && 'bg-amber-50/40'
                  )}
                >
                  <span className={cn(row.bold ? 'font-bold text-slate-800' : 'text-slate-600')}>{row.label}</span>
                  <span
                    className={cn(
                      'tabular-nums font-semibold',
                      row.taxa && row.valor > 0.009 ? 'text-red-600' : 'text-slate-900',
                      row.bold && 'font-extrabold'
                    )}
                  >
                    {row.valor >= 0 && row.label.includes('Desvio') ? '+' : ''}
                    {formatCurrency(row.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">Composição do custo — realizado</p>
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 text-xs">
                {taxa.composicao_realizado.map((l) => (
                  <div key={l.key} className="flex justify-between px-3 py-2">
                    <span className="text-slate-600">{l.label}</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(l.valor)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 bg-[#004D40]/5 font-bold">
                  <span className="text-[#004D40]">= Custo taxa</span>
                  <span className="tabular-nums text-[#004D40]">{formatCurrency(taxa.custo_realizado)}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">Composição do custo — orçado</p>
              <div className="rounded-xl border border-slate-100 divide-y divide-slate-50 text-xs">
                {taxa.composicao_orcado.map((l) => (
                  <div key={l.key} className="flex justify-between px-3 py-2">
                    <span className="text-slate-600">{l.label}</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(l.valor)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 bg-slate-50 font-bold">
                  <span>= Custo orçado taxa</span>
                  <span className="tabular-nums">{formatCurrency(taxa.custo_orcado)}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{taxa.orcado_fonte}</p>
            </div>
          </div>

          {taxa.rubricas.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">Rubricas da taxa de serviço</p>
              <div className="rounded-xl border border-slate-100 overflow-auto max-h-40">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-1.5 font-bold text-slate-400">Cód.</th>
                      <th className="px-3 py-1.5 font-bold text-slate-400">Descrição</th>
                      <th className="px-3 py-1.5 font-bold text-slate-400 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {taxa.rubricas.map((r) => (
                      <tr key={`${r.codigo}-${r.nome}`}>
                        <td className="px-3 py-1.5 tabular-nums text-slate-400">{r.codigo ?? '—'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{r.nome}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                          {formatCurrency(r.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-slate-100">
            <label className="text-xs block flex-1 min-w-[200px]">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                Orçado bruto da taxa (competência)
              </span>
              <input
                type="number"
                step="0.01"
                value={orcadoEdit}
                onChange={(e) => setOrcadoEdit(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                placeholder="Ex.: valor orçado para distribuição"
              />
            </label>
            <button
              type="button"
              onClick={salvarOrcado}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              Salvar orçado taxa
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FgtsPanel: React.FC<{ fgts: FgtsAnalise; canViewEmprestimos: boolean }> = ({
  fgts,
  canViewEmprestimos,
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-4 py-3 border-b border-teal-50 bg-teal-50/50 flex items-center justify-between gap-2 text-left hover:bg-teal-50"
      >
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-teal-800" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">FGTS</h3>
            <p className="text-xs text-slate-500">
              Normal, férias, 13º e demais — fonte da guia importada quando disponível
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-extrabold tabular-nums text-teal-900">
            {formatCurrency(fgts.total_fgts)}
          </span>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{fgts.aviso_emprestimos}</span>
          </div>

          {fgts.componentes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              Nenhum FGTS informado para esta competência. Importe as guias de provisão ou cadastre manualmente.
            </p>
          ) : (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 font-bold text-slate-400 uppercase tracking-wider">Componente</th>
                    <th className="px-3 py-2 font-bold text-slate-400 uppercase tracking-wider text-right">Valor</th>
                    <th className="px-3 py-2 font-bold text-slate-400 uppercase tracking-wider text-right">%</th>
                    <th className="px-3 py-2 font-bold text-slate-400 uppercase tracking-wider">Fonte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fgts.componentes.map((c) => (
                    <tr key={c.key}>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{c.label}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-slate-900">
                        {formatCurrency(c.valor)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{c.pct.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-slate-500">{c.fonte}</td>
                    </tr>
                  ))}
                  <tr className="bg-teal-50/50 font-bold">
                    <td className="px-3 py-2.5 text-teal-900">Total FGTS</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-teal-900">{formatCurrency(fgts.total_fgts)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-teal-800">100%</td>
                    <td className="px-3 py-2.5 text-[10px] text-teal-700">Sem empréstimos/consignados</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {fgts.emprestimos_excluidos > 0.009 && (
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">
                Empréstimos excluídos do FGTS
                {canViewEmprestimos ? ` (${formatCurrency(fgts.emprestimos_excluidos)})` : ''}
              </p>
              {canViewEmprestimos && fgts.emprestimos_itens.length > 0 ? (
                <div className="rounded-xl border border-slate-100 overflow-auto max-h-36">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-1.5 font-bold text-slate-400">Cód.</th>
                        <th className="px-3 py-1.5 font-bold text-slate-400">Rubrica</th>
                        <th className="px-3 py-1.5 font-bold text-slate-400 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {fgts.emprestimos_itens.map((e, i) => (
                        <tr key={`${e.codigo}-${i}`}>
                          <td className="px-3 py-1.5 tabular-nums text-slate-400">{e.codigo ?? '—'}</td>
                          <td className="px-3 py-1.5 text-slate-700">{e.nome}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-red-600 font-semibold">
                            {formatCurrency(e.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  Detalhes por colaborador restritos ao RH e ao financeiro.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const PainelRhPage: React.FC<{
  user?: { role?: string; permissions?: RolePermissionRow[] | null };
}> = ({ user }) => {
  const canViewEmprestimos = canViewEmprestimosConfidenciais(user?.role, user?.permissions);
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [empresa, setEmpresa] = useState('');
  const [setor, setSetor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<FolhaPainelResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ year, month });
      if (empresa.trim()) qs.set('empresa', empresa.trim());
      if (setor.trim()) qs.set('setor', setor.trim());
      const res = await fetch(`/api/folha/painel?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o painel RH.');
      setData(json);
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Erro ao carregar painel RH.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, empresa, setor]);

  const tituloCompetencia = useMemo(() => {
    const mesLabel = MESES[Number(month)] || month;
    return `${String(mesLabel).toUpperCase()}/${year}`;
  }, [month, year]);

  const totaisSetores = useMemo(() => {
    const rows = data?.setores_resumo ?? [];
    return rows.reduce(
      (acc, r) => ({
        orcado: acc.orcado + r.orcado,
        realizado: acc.realizado + r.realizado,
        diferenca: acc.diferenca + r.diferenca,
        funcionarios: acc.funcionarios + r.funcionarios,
      }),
      { orcado: 0, realizado: 0, diferenca: 0, funcionarios: 0 }
    );
  }, [data?.setores_resumo]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Orçado × Realizado da folha</h2>
          <p className="text-sm text-slate-500">
            Compara orçamento do setor com a folha realizada (apuração). Desvio = Realizado − Orçado.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
        >
          <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="block text-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Competência</span>
            <div className="mt-1 flex gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                {MESES.slice(1).map((label, idx) => (
                  <option key={label} value={String(idx + 1)}>
                    {String(idx + 1).padStart(2, '0')} · {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </div>
          </label>

          <label className="block text-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Empresa
            </span>
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="">Todas</option>
              {(data?.filtros.empresas ?? []).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm md:col-span-2 xl:col-span-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-3 h-3" /> Setor / centro de custo
            </span>
            <div className="mt-1 flex gap-2">
              <select
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                <option value="">Todos os setores</option>
                {(data?.filtros.setores ?? []).map((s) => (
                  <option key={s.nome} value={s.nome}>
                    {s.codigo ? `${s.codigo} · ` : ''}
                    {s.nome}
                  </option>
                ))}
              </select>
              {setor && (
                <button
                  type="button"
                  onClick={() => setSetor('')}
                  className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-xl border border-slate-200"
                  title="Limpar filtro de setor"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="py-16 flex items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando comparativo...
        </div>
      )}

      {data && (
        <>
          <div className="bg-gradient-to-br from-[#004D40] to-[#00695C] rounded-2xl shadow-lg p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                  Folha — {tituloCompetencia}
                </p>
                {data.setor && (
                  <p className="text-sm text-white/90 mt-1">
                    Setor: <span className="font-bold">{data.setor}</span>
                  </p>
                )}
                {data.empresa && (
                  <p className="text-sm text-white/80 mt-0.5">
                    Empresa: <span className="font-semibold">{data.empresa}</span>
                  </p>
                )}
              </div>
              <StatusBadge acima={data.acima_orcamento} label={data.status_label} />
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Orçado</p>
                <p className="text-2xl font-extrabold tabular-nums mt-1">{formatCurrency(data.orcado)}</p>
                <p className="text-[10px] text-white/60 mt-1 truncate">{data.fontes.orcado}</p>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Realizado</p>
                <p className="text-2xl font-extrabold tabular-nums mt-1">{formatCurrency(data.realizado)}</p>
                <p className="text-[10px] text-white/60 mt-1 truncate">{data.fontes.realizado}</p>
              </div>
              <div
                className={cn(
                  'rounded-xl px-4 py-3',
                  data.acima_orcamento ? 'bg-red-500/25' : 'bg-emerald-500/20'
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Desvio (R$)</p>
                <p className="text-2xl font-extrabold tabular-nums mt-1">
                  {data.diferenca >= 0 ? '+' : ''}
                  {formatCurrency(data.diferenca)}
                </p>
                <p className="text-[10px] text-white/70 mt-1">Realizado − Orçado</p>
              </div>
              <div
                className={cn(
                  'rounded-xl px-4 py-3',
                  data.acima_orcamento ? 'bg-red-500/25' : 'bg-emerald-500/20'
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Desvio (%)</p>
                <p className="text-2xl font-extrabold tabular-nums mt-1">{formatPct(data.pct_diferenca)}</p>
                <p className="text-[10px] text-white/70 mt-1">Sobre o orçado</p>
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <BarCompare orcado={data.orcado} realizado={data.realizado} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Funcionários', value: data.indicadores.funcionarios, icon: Users, currency: false },
              { label: 'Trabalhando', value: data.indicadores.trabalhando, icon: Users, currency: false },
              {
                label: 'Custo médio',
                value: data.indicadores.custo_medio,
                icon: Wallet,
                currency: true,
              },
              {
                label: 'Apuração',
                value: data.indicadores.apuracao_calculada ? 'Calculada' : 'Pendente',
                icon: Layers,
                currency: false,
                text: true,
              },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <card.icon className="w-4 h-4" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">{card.label}</p>
                </div>
                <p className="text-lg font-extrabold text-slate-900 mt-2 tabular-nums">
                  {card.text
                    ? String(card.value)
                    : card.currency
                      ? formatCurrency(Number(card.value) || 0)
                      : Number(card.value).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
          </div>

          {data.taxa_servico && (
            <TaxaServicoPanel
              taxa={data.taxa_servico}
              folhaOrcado={data.orcado}
              folhaRealizado={data.realizado}
              folhaDiferenca={data.diferenca}
              year={year}
              month={month}
              onSaved={load}
            />
          )}

          {data.fgts && <FgtsPanel fgts={data.fgts} canViewEmprestimos={canViewEmprestimos} />}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Comparativo por setor</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Orçamento do cadastro de setores × folha realizada (rateio por peso salarial).
                </p>
              </div>
              <p className="text-[10px] text-slate-400">Clique em um setor para drill-down</p>
            </div>

            {(data.sem_setor ?? 0) > 0 && (
              <div className="px-4 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
                {data.sem_setor} funcionário(s) sem setor no cadastro — atribua em Cadastros › Colaboradores.
              </div>
            )}

            {data.setores_resumo.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-400 text-center">
                Nenhum setor identificado nos lançamentos da competência.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left min-w-[720px]">
                  <thead>
                    <tr className="bg-slate-50/80">
                      {['Setor', 'Orçado', 'Realizado', 'Desvio (R$)', 'Desvio (%)', 'Status', 'Func.'].map(
                        (h) => (
                          <th
                            key={h}
                            className={cn(
                              'px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest',
                              !['Setor', 'Status'].includes(h) && h !== 'Func.' && 'text-right',
                              h === 'Func.' && 'text-center',
                              h === 'Status' && 'text-center'
                            )}
                          >
                            {h}
                          </th>
                        )
                      )}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.setores_resumo.map((row) => (
                      <tr
                        key={row.setor}
                        className={cn(
                          'hover:bg-slate-50/70 cursor-pointer transition-colors',
                          setor === row.setor && 'bg-emerald-50/60'
                        )}
                        onClick={() => setSetor(row.setor)}
                      >
                        <td className="px-3 py-2.5 text-xs text-slate-800 font-medium">
                          {row.setor_codigo && (
                            <span className="text-slate-400 tabular-nums mr-1">{row.setor_codigo}</span>
                          )}
                          {row.setor}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-right tabular-nums text-slate-600">
                          {formatCurrency(row.orcado)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-right tabular-nums font-semibold text-slate-900">
                          {formatCurrency(row.realizado)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-xs text-right tabular-nums font-bold',
                            row.acima_orcamento ? 'text-red-600' : 'text-emerald-700'
                          )}
                        >
                          {row.diferenca >= 0 ? '+' : ''}
                          {formatCurrency(row.diferenca)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-xs text-right tabular-nums font-semibold',
                            row.acima_orcamento ? 'text-red-600' : 'text-emerald-700'
                          )}
                        >
                          {formatPct(row.pct_diferenca)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusBadge acima={row.acima_orcamento} label={row.status_label} compact />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-center tabular-nums text-slate-500">
                          {row.funcionarios}
                        </td>
                        <td className="px-2 py-2.5 text-slate-300">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/90 font-bold">
                      <td className="px-3 py-2.5 text-xs text-slate-700">Total setores</td>
                      <td className="px-3 py-2.5 text-xs text-right tabular-nums text-slate-700">
                        {formatCurrency(totaisSetores.orcado)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right tabular-nums text-slate-900">
                        {formatCurrency(totaisSetores.realizado)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-xs text-right tabular-nums',
                          totaisSetores.diferenca > 0.009 ? 'text-red-600' : 'text-emerald-700'
                        )}
                      >
                        {totaisSetores.diferenca >= 0 ? '+' : ''}
                        {formatCurrency(totaisSetores.diferenca)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {data.drilldown && data.drilldown.funcionarios.length > 0 && (
            <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-emerald-50 bg-emerald-50/40 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Drill-down — {data.drilldown.setor}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Custo rateado por peso salarial de cada colaborador no setor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSetor('')}
                  className="text-xs font-bold text-[#004D40] hover:underline"
                >
                  Voltar para todos os setores
                </button>
              </div>
              <div className="overflow-auto max-h-[480px]">
                <table className="w-full text-left min-w-[680px]">
                  <thead>
                    <tr className="bg-slate-50/80">
                      {['Matrícula', 'Nome', 'Orçado', 'Realizado', 'Desvio (R$)', 'Desvio (%)', 'Status'].map(
                        (h) => (
                          <th
                            key={h}
                            className={cn(
                              'px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest',
                              !['Matrícula', 'Nome', 'Status'].includes(h) && 'text-right',
                              h === 'Status' && 'text-center'
                            )}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.drilldown.funcionarios.map((f) => (
                      <tr key={f.codigo_funcionario} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{f.codigo_funcionario}</td>
                        <td className="px-3 py-2 text-xs font-medium text-slate-800">{f.nome}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">
                          {formatCurrency(f.orcado)}
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-900">
                          {formatCurrency(f.realizado)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-xs text-right tabular-nums font-bold',
                            f.acima_orcamento ? 'text-red-600' : 'text-emerald-700'
                          )}
                        >
                          {f.diferenca >= 0 ? '+' : ''}
                          {formatCurrency(f.diferenca)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-xs text-right tabular-nums font-semibold',
                            f.acima_orcamento ? 'text-red-600' : 'text-emerald-700'
                          )}
                        >
                          {formatPct(f.pct_diferenca)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <StatusBadge acima={f.acima_orcamento} label={f.status_label} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {data.composicao ? (
              <ComposicaoCustoPanel composicao={data.composicao} />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Composição do custo da folha</h3>
                </div>
                <p className="px-4 py-8 text-sm text-slate-400 text-center">
                  {data.indicadores.importado
                    ? 'Processe a apuração para ver a composição detalhada.'
                    : 'Importe o extrato mensal para esta competência.'}
                </p>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Estrutura do custo</h3>
              <div className="text-xs text-slate-600 space-y-1 font-mono bg-slate-50 rounded-xl p-3">
                <p className="font-bold text-slate-800">CUSTO DA FOLHA</p>
                <p>Salário bruto</p>
                <p>+ Adicionais</p>
                <p>+ Taxa de serviço</p>
                <p>+ Encargos (INSS + FGTS)</p>
                <p>+ Provisões (13º, férias, 1/3)</p>
                <p>+ Outros</p>
                <p className="font-bold text-[#004D40] border-t border-slate-200 pt-2 mt-2">
                  = Custo empresa
                </p>
              </div>
              <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                <li>
                  <strong>Adicionais:</strong> comissões, produtividade, taxa de serviço, quebra de caixa, idioma e
                  demais rubricas.
                </li>
                <li>
                  <strong>Encargos:</strong> INSS e FGTS (mensal e sobre provisões).
                </li>
                <li>
                  <strong>Provisões:</strong> 13º, férias e 1/3 — calculadas na apuração ou pagas no mês.
                </li>
                <li>Expanda cada grupo para ver rubricas do extrato.</li>
              </ul>
            </div>
          </div>

          {!data.indicadores.importado && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              Nenhum dado importado para {MESES[Number(month)]}/{year}. Importe o extrato em{' '}
              <span className="font-bold">Importação › Extrato Mensal</span> e processe a apuração.
            </div>
          )}
        </>
      )}
    </div>
  );
};
