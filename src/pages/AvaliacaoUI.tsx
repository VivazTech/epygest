import React, { useMemo, useState } from 'react';
import {
  FlaskConical,
  Check,
  Loader2,
  Trash2,
  Plus,
  Download,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { SearchableSelect, type SearchableSelectOption } from '../components/SearchableSelect';
import { useToast } from '../context/ToastContext';

type SectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ title, description, children }) => (
  <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
    <div>
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">{title}</h3>
      {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
    </div>
    {children}
  </section>
);

const selectOptions: SearchableSelectOption[] = [
  { value: 'ab', label: 'A&B — Alimentos e Bebidas', keywords: 'restaurante bar' },
  { value: 'rh', label: 'RH — Recursos Humanos', keywords: 'folha pessoas' },
  { value: 'gov', label: 'Governança', keywords: 'limpeza andar' },
  { value: 'mnt', label: 'Manutenção', keywords: 'reparos obras' },
  { value: 'com', label: 'Comercial', keywords: 'vendas reservas' },
  { value: 'ti', label: 'Tecnologia da Informação', keywords: 'sistemas rede' },
];

export const AvaliacaoUIPage: React.FC = () => {
  const { showSuccess } = useToast();
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [nativeSelect, setNativeSelect] = useState('');
  const [multiSelect, setMultiSelect] = useState<string[]>([]);
  const [searchable, setSearchable] = useState('');
  const [disabledSearchable] = useState('rh');
  const [toggle, setToggle] = useState(true);
  const [radio, setRadio] = useState('mensal');
  const [range, setRange] = useState(60);
  const [text, setText] = useState('');

  const selectedLabel = useMemo(
    () => selectOptions.find((o) => o.value === searchable)?.label ?? '—',
    [searchable]
  );

  const simulateLoading = () => {
    setLoadingBtn(true);
    window.setTimeout(() => {
      setLoadingBtn(false);
      showSuccess('Ação simulada concluída com sucesso.');
    }, 1200);
  };

  const toggleMulti = (value: string) => {
    setMultiSelect((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Avaliação de UI</h2>
          <p className="text-sm text-slate-500">
            Página de testes com botões, selects e outros componentes para avaliar o frontend e o padrão de código.
          </p>
        </div>
      </div>

      <Section
        title="Botões"
        description="Variações de estilo, estados e tamanhos usados no sistema."
      >
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] transition-colors">
            <Plus className="w-4 h-4" /> Primário
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-900/10">
            <Check className="w-4 h-4" /> Sucesso
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 text-sm font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" /> Secundário
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 text-sm font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-colors">
            <Trash2 className="w-4 h-4" /> Perigo
          </button>
          <button
            onClick={simulateLoading}
            disabled={loadingBtn}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60 transition-colors"
          >
            {loadingBtn ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {loadingBtn ? 'Processando...' : 'Simular ação (toast)'}
          </button>
          <button
            disabled
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-400 text-sm font-bold rounded-xl cursor-not-allowed"
          >
            Desabilitado
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#004D40] text-white">Pequeno</button>
          <button className="px-4 py-2 text-sm font-bold rounded-xl bg-[#004D40] text-white">Médio</button>
          <button className="px-6 py-3 text-base font-bold rounded-2xl bg-[#004D40] text-white">Grande</button>
        </div>
      </Section>

      <Section
        title="Selects"
        description="Select nativo, seleção múltipla por chips e o SearchableSelect com busca."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Select nativo
            </label>
            <select
              value={nativeSelect}
              onChange={(e) => setNativeSelect(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800"
            >
              <option value="">Selecione um setor</option>
              {selectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Selecionado: <span className="font-semibold text-slate-700">{nativeSelect || '—'}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              SearchableSelect (com busca)
            </label>
            <SearchableSelect
              value={searchable}
              onChange={setSearchable}
              options={selectOptions}
              placeholder="Buscar setor..."
            />
            <p className="text-xs text-slate-500">
              Selecionado: <span className="font-semibold text-slate-700">{selectedLabel}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              SearchableSelect desabilitado
            </label>
            <SearchableSelect
              value={disabledSearchable}
              onChange={() => {}}
              options={selectOptions}
              disabled
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Seleção múltipla (chips)
            </label>
            <div className="flex flex-wrap gap-2">
              {selectOptions.map((o) => {
                const active = multiSelect.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleMulti(o.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {o.value.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              {multiSelect.length ? multiSelect.join(', ') : 'Nenhum selecionado'}
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Campos e controles"
        description="Input, toggle, radios e range para avaliar interações."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Campo de texto
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite algo..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Toggle
            </label>
            <button
              type="button"
              onClick={() => setToggle((v) => !v)}
              className={cn(
                'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                toggle ? 'bg-emerald-500' : 'bg-slate-300'
              )}
              role="switch"
              aria-checked={toggle}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow',
                  toggle ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
            <p className="text-xs text-slate-500">{toggle ? 'Ativado' : 'Desativado'}</p>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Opções (radio)
            </label>
            <div className="flex gap-2">
              {['diario', 'mensal', 'anual'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRadio(opt)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize',
                    radio === opt
                      ? 'bg-[#004D40] text-white border-[#004D40]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Range: {range}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
          </div>
        </div>
      </Section>

      <Section title="Avisos (feedback visual)">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" /> Operação concluída com sucesso.
          </div>
          <div className="flex items-center gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 shrink-0" /> Informação de contexto para o usuário.
          </div>
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Algo deu errado — verifique os dados.
          </div>
        </div>
      </Section>
    </div>
  );
};

{/* <Section title="Avisos (feedback visual)">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" /> Operação concluída com sucesso.
          </div>
          <div className="flex items-center gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 shrink-0" /> Informação de contexto para o usuário.
          </div>
          <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Algo deu errado — verifique os dados.
          </div>
        </div>
      </Section> */}