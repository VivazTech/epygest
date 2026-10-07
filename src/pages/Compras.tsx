import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileCheck, Clock, Loader2, Download, RotateCcw, Search, Paperclip, X, FileText, BadgeCheck, XCircle, Archive } from 'lucide-react';
import { cn, formatCurrency, formatCurrencyInput, formatDate, parseCurrencyInputDigits } from '../lib/utils';
import { SearchableSelect } from '../components/SearchableSelect';
import { isSharedCrdCode } from '../lib/sharedCrds';
import { useToast } from '../context/ToastContext';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { launchStatusMeta } from '../lib/launchFlow';
import { confirmCancel } from '../lib/confirmAction';

type Tab = 'ordem' | 'aprovacao';

type FaturamentoTipo = 'nf_recibo' | 'recibo' | '';
type PagamentoTipo = 'cartao' | 'avista' | 'boleto' | 'pix' | 'transferencia' | '';

const MAX_ANEXOS = 6;
const MAX_ANEXO_BYTES = 10 * 1024 * 1024;
const ANEXO_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/png,image/jpeg,image/webp';

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

interface OrdemForm {
  data_execucao: string;
  prestador: string;
  telefone: string;
  servico_executado: string;
  servico_sector_id: string;
  servico_crd_id: string;
  servico_setor: string;
  servico_crd: string;
  materiais_descricao: string;
  materiais_sector_id: string;
  materiais_crd_id: string;
  materiais_setor: string;
  materiais_crd: string;
  valor: string;
  faturamento: FaturamentoTipo;
  pagamento: PagamentoTipo;
  pix_chave: string;
  banco: string;
  agencia: string;
  conta_corrente: string;
  cnpj_cpf: string;
  nome_titular: string;
  observacao: string;
  solicitado_por: string;
}

interface OrdemRow {
  id: number;
  protocol: string | null;
  data_execucao: string | null;
  created_at: string;
  prestador: string;
  servico_executado: string | null;
  servico_sector_id: number | null;
  servico_crd_id: number | null;
  materiais_descricao: string | null;
  materiais_sector_id: number | null;
  materiais_crd_id: number | null;
  valor: number | string;
  pagamento: string | null;
  status: string;
  solicitado_por: string | null;
  nota_file_name: string | null;
  recibo_file_name: string | null;
  boleto_file_name: string | null;
  users?: { name?: string | null } | null;
}

const PAGAMENTO_LABEL: Record<string, string> = {
  cartao: 'Cartão',
  avista: 'À vista',
  boleto: 'Boleto',
  pix: 'PIX',
  transferencia: 'Transferência',
};

const EMPTY_FORM: OrdemForm = {
  data_execucao: '',
  prestador: '',
  telefone: '',
  servico_executado: '',
  servico_sector_id: '',
  servico_crd_id: '',
  servico_setor: '',
  servico_crd: '',
  materiais_descricao: '',
  materiais_sector_id: '',
  materiais_crd_id: '',
  materiais_setor: '',
  materiais_crd: '',
  valor: '',
  faturamento: '',
  pagamento: '',
  pix_chave: '',
  banco: '',
  agencia: '',
  conta_corrente: '',
  cnpj_cpf: '',
  nome_titular: '',
  observacao: '',
  solicitado_por: '',
};

const selectClass =
  'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#004D40]/30 focus:border-[#004D40]/40';

const crdLabel = (c: any) => {
  const code = String(c?.code || '').trim();
  const name = String(c?.name || '').trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || String(c?.id || '');
};

const onlyDigits = (value: string) => String(value || '').replace(/\D/g, '');

/** Máscara CNPJ (14) ou CPF (11). */
const formatCnpjCpf = (raw: string) => {
  const d = onlyDigits(raw).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const Label: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
    {children}{required && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

const Field: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('space-y-1', className)}>{children}</div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={cn(
      'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#004D40]/30 focus:border-[#004D40]/40 placeholder:text-slate-300',
      props.className
    )}
  />
);

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea
    {...props}
    className={cn(
      'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#004D40]/30 focus:border-[#004D40]/40 placeholder:text-slate-300 resize-none',
      props.className
    )}
  />
);

const RadioCard: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <label
    className={cn(
      'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
      checked
        ? 'border-[#004D40] bg-emerald-50/60'
        : 'border-slate-200 bg-white hover:bg-slate-50'
    )}
  >
    <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 accent-[#004D40]" />
    <div>
      <p className={cn('text-sm font-semibold', checked ? 'text-[#004D40]' : 'text-slate-700')}>{label}</p>
      {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
    </div>
  </label>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">
    {children}
  </h3>
);

export const ComprasPage: React.FC = () => {
  const { showSuccess } = useToast();
  const { query } = useSearch();
  const [activeTab, setActiveTab] = useState<Tab>('ordem');
  const [form, setForm] = useState<OrdemForm>(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);
  const [anexos, setAnexos] = useState<File[]>([]);
  const anexosInputRef = useRef<HTMLInputElement>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'ok' | 'error' | 'skip'>('idle');
  const [cnpjMessage, setCnpjMessage] = useState('');
  const lastLookupRef = useRef('');
  const [sectors, setSectors] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [userRole, setUserRole] = useState('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [grantedCrdIds, setGrantedCrdIds] = useState<string[]>([]);
  const [ordens, setOrdens] = useState<OrdemRow[]>([]);
  const [ordensLoading, setOrdensLoading] = useState(false);
  const [ordensError, setOrdensError] = useState('');
  const [notaFile, setNotaFile] = useState<File | null>(null);
  const [reciboFile, setReciboFile] = useState<File | null>(null);
  const [boletoFile, setBoletoFile] = useState<File | null>(null);
  const notaInputRef = useRef<HTMLInputElement>(null);
  const reciboInputRef = useRef<HTMLInputElement>(null);
  const boletoInputRef = useRef<HTMLInputElement>(null);

  const loadOrdens = useCallback(async () => {
    setOrdensLoading(true);
    setOrdensError('');
    try {
      const res = await fetch('/api/ordens-compra');
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'Não foi possível carregar as ordens.');
      setOrdens(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setOrdensError(err?.message || 'Não foi possível carregar as ordens.');
    } finally {
      setOrdensLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [sectorsRes, crdsRes, meRes] = await Promise.all([
          fetch('/api/sectors'),
          fetch('/api/crds'),
          fetch('/api/auth/me'),
        ]);
        const sectorsData = await sectorsRes.json().catch(() => []);
        const crdsData = await crdsRes.json().catch(() => []);
        setSectors(Array.isArray(sectorsData) ? sectorsData.filter((s: any) => s.active !== false) : []);
        setCrds(Array.isArray(crdsData) ? crdsData.filter((c: any) => c.active !== false) : []);

        if (meRes.ok) {
          const user = await meRes.json();
          setUserRole(String(user?.role || 'viewer'));
          setAllowedSectorIds(
            Array.from(
              new Set(
                (Array.isArray(user?.sector_ids) ? user.sector_ids : [user?.sector_id])
                  .map((id: unknown) => String(id ?? '').trim())
                  .filter(Boolean)
              )
            )
          );
          setGrantedCrdIds(
            Array.from(
              new Set(
                (Array.isArray(user?.crd_ids) ? user.crd_ids : [])
                  .map((id: unknown) => String(id ?? '').trim())
                  .filter(Boolean)
              )
            )
          );
        }
      } catch {
        setSectors([]);
        setCrds([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (activeTab === 'aprovacao') loadOrdens();
  }, [activeTab, loadOrdens]);

  const hasGlobalSectorView =
    userRole === 'admin' || userRole === 'finance' || userRole === 'controle';

  const visibleSectors = useMemo(() => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return sectors;
    if (allowedSectorIds.length === 0) return sectors;
    return sectors.filter((s) => allowedSectorIds.includes(String(s.id)));
  }, [sectors, allowedSectorIds, hasGlobalSectorView]);

  const crdsForSector = useCallback(
    (sectorId: string) => {
      if (!sectorId) return [];
      return crds.filter((c) => {
        const sameSector = String(c.sector_id) === sectorId;
        const shared = isSharedCrdCode(c.code);
        const granted = grantedCrdIds.includes(String(c.id));
        if (hasGlobalSectorView) return sameSector || shared;
        return sameSector || shared || granted;
      });
    },
    [crds, grantedCrdIds, hasGlobalSectorView]
  );

  const servicoCrdOptions = useMemo(
    () =>
      crdsForSector(form.servico_sector_id).map((c) => ({
        value: String(c.id),
        label: crdLabel(c),
        keywords: `${c.code || ''} ${c.name || ''}`,
      })),
    [crdsForSector, form.servico_sector_id]
  );

  const materiaisCrdOptions = useMemo(
    () =>
      crdsForSector(form.materiais_sector_id).map((c) => ({
        value: String(c.id),
        label: crdLabel(c),
        keywords: `${c.code || ''} ${c.name || ''}`,
      })),
    [crdsForSector, form.materiais_sector_id]
  );

  const set = (field: keyof OrdemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setVal = (field: keyof OrdemForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const setServicoSector = (sectorId: string) => {
    const sector = sectors.find((s) => String(s.id) === sectorId);
    setForm((prev) => ({
      ...prev,
      servico_sector_id: sectorId,
      servico_setor: sector ? String(sector.name || '') : '',
      servico_crd_id: '',
      servico_crd: '',
    }));
  };

  const setServicoCrd = (crdId: string) => {
    const crd = crds.find((c) => String(c.id) === crdId);
    setForm((prev) => ({
      ...prev,
      servico_crd_id: crdId,
      servico_crd: crd ? crdLabel(crd) : '',
    }));
  };

  const setMateriaisSector = (sectorId: string) => {
    const sector = sectors.find((s) => String(s.id) === sectorId);
    setForm((prev) => ({
      ...prev,
      materiais_sector_id: sectorId,
      materiais_setor: sector ? String(sector.name || '') : '',
      materiais_crd_id: '',
      materiais_crd: '',
    }));
  };

  const setMateriaisCrd = (crdId: string) => {
    const crd = crds.find((c) => String(c.id) === crdId);
    setForm((prev) => ({
      ...prev,
      materiais_crd_id: crdId,
      materiais_crd: crd ? crdLabel(crd) : '',
    }));
  };

  const lookupCnpj = useCallback(async (raw: string) => {
    const digits = onlyDigits(raw);
    if (digits.length === 11) {
      setCnpjStatus('skip');
      setCnpjMessage('CPF informado — preencha prestador e telefone manualmente.');
      return;
    }
    if (digits.length !== 14) {
      setCnpjStatus('idle');
      setCnpjMessage('');
      return;
    }
    if (lastLookupRef.current === digits) return;
    lastLookupRef.current = digits;
    setCnpjLoading(true);
    setCnpjStatus('idle');
    setCnpjMessage('Consultando Receita Federal…');
    try {
      const res = await fetch(`/api/cnpj/${digits}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCnpjStatus('error');
        setCnpjMessage(json.error || 'CNPJ não encontrado.');
        return;
      }
      setForm((prev) => ({
        ...prev,
        cnpj_cpf: formatCnpjCpf(digits),
        prestador: String(json.prestador || json.razao_social || prev.prestador).trim(),
        telefone: String(json.telefone || prev.telefone).trim(),
        nome_titular: prev.nome_titular.trim()
          ? prev.nome_titular
          : String(json.razao_social || json.prestador || '').trim(),
      }));
      setCnpjStatus('ok');
      setCnpjMessage(
        json.nome_fantasia && json.razao_social && json.nome_fantasia !== json.razao_social
          ? `Encontrado: ${json.nome_fantasia} (${json.razao_social})`
          : `Encontrado: ${json.prestador || json.razao_social}`
      );
    } catch {
      setCnpjStatus('error');
      setCnpjMessage('Falha ao consultar o CNPJ. Tente novamente.');
      lastLookupRef.current = '';
    } finally {
      setCnpjLoading(false);
    }
  }, []);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatCnpjCpf(e.target.value);
    const digits = onlyDigits(masked);
    setForm((prev) => ({ ...prev, cnpj_cpf: masked }));
    setCnpjStatus('idle');
    setCnpjMessage('');
    if (digits.length !== 14) lastLookupRef.current = '';
    if (digits.length === 14) lookupCnpj(digits);
  };

  const handleAnexosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;

    const errors: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      if (file.size > MAX_ANEXO_BYTES) {
        errors.push(`${file.name}: excede 10 MB (${formatBytes(file.size)})`);
        continue;
      }
      accepted.push(file);
    }

    setAnexos((prev) => {
      const room = MAX_ANEXOS - prev.length;
      if (room <= 0) {
        errors.push(`Limite de ${MAX_ANEXOS} arquivos atingido.`);
        return prev;
      }
      if (accepted.length > room) {
        errors.push(`Só foi possível adicionar mais ${room} arquivo(s) (máx. ${MAX_ANEXOS}).`);
      }
      return [...prev, ...accepted.slice(0, room)];
    });

    if (errors.length) alert(errors.join('\n'));
  };

  const removeAnexo = (index: number) => {
    setAnexos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGerarPdf = async () => {
    setGenerating(true);
    try {
      const payload = new FormData();
      (Object.keys(form) as Array<keyof OrdemForm>).forEach((key) => {
        payload.append(key, form[key] ?? '');
      });
      anexos.forEach((file) => payload.append('anexos', file));
      if (notaFile) payload.append('nota_file', notaFile);
      if (reciboFile) payload.append('recibo_file', reciboFile);
      if (form.pagamento === 'boleto' && boletoFile) payload.append('boleto_file', boletoFile);

      const res = await fetch('/api/ordem-compra/pdf', {
        method: 'POST',
        body: payload,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || 'Erro ao gerar PDF.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const protocol = res.headers.get('X-Ordem-Protocol');
      const prestador = form.prestador.trim().replace(/\s+/g, '_').slice(0, 30) || 'ordem';
      a.download = protocol ? `ordem_compra_${protocol}.pdf` : `ordem_compra_${prestador}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess(protocol ? `Ordem ${protocol} lançada para aprovação.` : 'Ordem lançada para aprovação.');
      loadOrdens();
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado.');
    } finally {
      setGenerating(false);
    }
  };

  const canApproveControl = userRole === 'controle' || userRole === 'admin';
  const canPayFinance = userRole === 'finance' || userRole === 'admin';

  const sectorNameById = (id: number | null) => {
    if (id == null) return '';
    return String(sectors.find((s) => Number(s.id) === Number(id))?.name || '');
  };

  const crdNameById = (id: number | null) => {
    if (id == null) return '';
    const crd = crds.find((c) => Number(c.id) === Number(id));
    return crd ? crdLabel(crd) : '';
  };

  const updateOrdemStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('esta ordem de compra')) return;
    const res = await fetch(`/api/ordens-compra/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar a ordem.');
      return;
    }
    const messages: Record<string, string> = {
      approved: 'Ordem aprovada pelo Controle.',
      posted: 'Pagamento registrado pelo Financeiro.',
      cancelled: 'Ordem cancelada.',
      open: 'Ordem devolvida para análise.',
    };
    showSuccess(messages[status] || 'Ordem atualizada.');
    loadOrdens();
  };

  const filteredOrdens = useMemo(
    () =>
      ordens.filter((ordem) =>
        matchesSearch(
          query,
          ordem.protocol,
          ordem.prestador,
          ordem.servico_executado,
          ordem.materiais_descricao,
          ordem.solicitado_por,
          ordem.users?.name,
          sectorNameById(ordem.servico_sector_id),
          sectorNameById(ordem.materiais_sector_id),
          crdNameById(ordem.servico_crd_id),
          crdNameById(ordem.materiais_crd_id),
          PAGAMENTO_LABEL[String(ordem.pagamento || '')]
        )
      ),
    [ordens, query, sectors, crds]
  );

  const openOrdemDocumento = async (id: number, kind: 'nota' | 'recibo' | 'boleto') => {
    try {
      const res = await fetch(`/api/ordens-compra/${id}/document-url?kind=${kind}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const pickFaturamentoFile = (file: File | undefined, setter: (value: File | null) => void) => {
    if (!file) return;
    if (file.size > MAX_ANEXO_BYTES) {
      alert(`${file.name}: excede 10 MB (${formatBytes(file.size)})`);
      return;
    }
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      alert('Envie a nota ou o recibo em PDF ou imagem (PNG, JPG, WEBP).');
      return;
    }
    setter(file);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'ordem', label: 'Ordem de Compra', icon: <FileCheck className="w-4 h-4" /> },
    { id: 'aprovacao', label: 'Aprovação Financeiro', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-900">Compras</h2>
        <p className="text-sm text-slate-500">Geração de ordens de compra e fluxo de aprovação.</p>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-white text-[#004D40] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'ordem' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Dados Gerais</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field className="sm:col-span-2">
                  <Label required>CNPJ / CPF</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      placeholder="00.000.000/0001-00"
                      value={form.cnpj_cpf}
                      onChange={handleCnpjChange}
                      onBlur={() => lookupCnpj(form.cnpj_cpf)}
                      className="pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {cnpjLoading
                        ? <Loader2 className="w-4 h-4 animate-spin text-[#004D40]" />
                        : <Search className="w-4 h-4" />}
                    </span>
                  </div>
                  {cnpjMessage && (
                    <p
                      className={cn(
                        'text-[11px] mt-1',
                        cnpjStatus === 'ok' && 'text-emerald-600',
                        cnpjStatus === 'error' && 'text-red-600',
                        (cnpjStatus === 'idle' || cnpjStatus === 'skip') && 'text-slate-400'
                      )}
                    >
                      {cnpjMessage}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Informe o CNPJ primeiro — prestador e telefone são preenchidos automaticamente pela Receita Federal.
                  </p>
                </Field>
                <Field className="sm:col-span-1">
                  <Label required>Data da Execução</Label>
                  <Input type="date" value={form.data_execucao} onChange={set('data_execucao')} />
                </Field>
                <Field className="sm:col-span-2">
                  <Label required>Prestador</Label>
                  <Input
                    type="text"
                    placeholder="Preenchido automaticamente pelo CNPJ"
                    value={form.prestador}
                    onChange={set('prestador')}
                  />
                </Field>
                <Field className="sm:col-span-1">
                  <Label>Telefone</Label>
                  <Input
                    type="text"
                    placeholder="(45) 99999-9999"
                    value={form.telefone}
                    onChange={set('telefone')}
                  />
                </Field>
                <Field className="sm:col-span-3">
                  <Label>Nome do titular da conta</Label>
                  <Input
                    type="text"
                    placeholder="Titular (preenchido com a razão social quando possível)"
                    value={form.nome_titular}
                    onChange={set('nome_titular')}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nome de quem é dono da conta que vai receber o pagamento.
                  </p>
                </Field>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Serviço Executado</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field className="sm:col-span-3">
                  <Label>Descrição do Serviço</Label>
                  <Textarea
                    rows={3}
                    placeholder="Descreva o serviço executado..."
                    value={form.servico_executado}
                    onChange={set('servico_executado')}
                  />
                </Field>
                <Field>
                  <Label>Setor</Label>
                  <select
                    value={form.servico_sector_id}
                    onChange={(e) => setServicoSector(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Selecione um setor</option>
                    {visibleSectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field className="sm:col-span-2">
                  <Label>CRD</Label>
                  <SearchableSelect
                    value={form.servico_crd_id}
                    onChange={setServicoCrd}
                    options={servicoCrdOptions}
                    disabled={!form.servico_sector_id}
                    placeholder={form.servico_sector_id ? 'Digite para buscar CRD...' : 'Selecione um setor primeiro'}
                    emptyMessage={form.servico_sector_id ? 'Nenhum CRD neste setor' : 'Selecione um setor primeiro'}
                    noResultsMessage="Nenhum CRD encontrado"
                  />
                </Field>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Materiais</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field className="sm:col-span-3">
                  <Label>Descrição dos Materiais</Label>
                  <Textarea
                    rows={3}
                    placeholder="Descreva os materiais utilizados..."
                    value={form.materiais_descricao}
                    onChange={set('materiais_descricao')}
                  />
                </Field>
                <Field>
                  <Label>Setor</Label>
                  <select
                    value={form.materiais_sector_id}
                    onChange={(e) => setMateriaisSector(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Selecione um setor</option>
                    {visibleSectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field className="sm:col-span-2">
                  <Label>CRD</Label>
                  <SearchableSelect
                    value={form.materiais_crd_id}
                    onChange={setMateriaisCrd}
                    options={materiaisCrdOptions}
                    disabled={!form.materiais_sector_id}
                    placeholder={form.materiais_sector_id ? 'Digite para buscar CRD...' : 'Selecione um setor primeiro'}
                    emptyMessage={form.materiais_sector_id ? 'Nenhum CRD neste setor' : 'Selecione um setor primeiro'}
                    noResultsMessage="Nenhum CRD encontrado"
                  />
                </Field>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Valor e Faturamento</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field>
                  <Label required>Valor a ser Pago (R$)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={form.valor ? formatCurrencyInput(form.valor) : ''}
                    onChange={(e) => setVal('valor', parseCurrencyInputDigits(e.target.value))}
                  />
                </Field>
                <div className="space-y-2">
                  <Label>Tipo de Faturamento</Label>
                  <RadioCard
                    checked={form.faturamento === 'nf_recibo'}
                    onChange={() => setVal('faturamento', 'nf_recibo')}
                    label="Nota Fiscal + Recibo"
                  />
                  <RadioCard
                    checked={form.faturamento === 'recibo'}
                    onChange={() => setVal('faturamento', 'recibo')}
                    label="Recibo (sem nota fiscal)"
                  />
                </div>
                <div className="sm:col-span-2 space-y-3 pt-2 border-t border-slate-100">
                  <div>
                    <Label>Nota ou recibo</Label>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Vincule o arquivo da nota fiscal, do recibo, ou os dois. PDF ou imagem, até 10 MB.
                    </p>
                  </div>
                  <input
                    ref={notaInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      pickFaturamentoFile(e.target.files?.[0], setNotaFile);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={reciboInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      pickFaturamentoFile(e.target.files?.[0], setReciboFile);
                      e.target.value = '';
                    }}
                  />
                  {([
                    { label: 'Nota fiscal', file: notaFile, open: () => notaInputRef.current?.click(), clear: () => setNotaFile(null) },
                    { label: 'Recibo', file: reciboFile, open: () => reciboInputRef.current?.click(), clear: () => setReciboFile(null) },
                  ] as const).map((item) => (
                    <div key={item.label} className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                        <p className="text-sm text-slate-700 truncate">
                          {item.file ? `${item.file.name} · ${formatBytes(item.file.size)}` : 'Nenhum arquivo'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={item.open}
                        className="text-xs font-semibold text-[#004D40] hover:underline shrink-0"
                      >
                        {item.file ? 'Trocar' : 'Vincular'}
                      </button>
                      {item.file && (
                        <button
                          type="button"
                          onClick={item.clear}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Remover"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Condições de Pagamento</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <RadioCard
                  checked={form.pagamento === 'cartao'}
                  onChange={() => setVal('pagamento', 'cartao')}
                  label="Cartão de Crédito"
                />
                <RadioCard
                  checked={form.pagamento === 'avista'}
                  onChange={() => setVal('pagamento', 'avista')}
                  label="À Vista — Efetivo"
                />
                <RadioCard
                  checked={form.pagamento === 'boleto'}
                  onChange={() => setVal('pagamento', 'boleto')}
                  label="Boleto Bancário"
                  description="Máximo de prazo possível considerando o vencimento"
                />
                <RadioCard
                  checked={form.pagamento === 'pix'}
                  onChange={() => setVal('pagamento', 'pix')}
                  label="PIX"
                />
                <RadioCard
                  checked={form.pagamento === 'transferencia'}
                  onChange={() => setVal('pagamento', 'transferencia')}
                  label="Transferência bancária"
                />
              </div>

              {form.pagamento === 'boleto' && (
                <div className="mb-4 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 flex items-center gap-3">
                  <input
                    ref={boletoInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      pickFaturamentoFile(e.target.files?.[0], setBoletoFile);
                      e.target.value = '';
                    }}
                  />
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Boleto</p>
                    <p className="text-sm text-slate-700 truncate">
                      {boletoFile ? `${boletoFile.name} · ${formatBytes(boletoFile.size)}` : 'Nenhum arquivo'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">PDF ou imagem, até 10 MB.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => boletoInputRef.current?.click()}
                    className="text-xs font-semibold text-[#004D40] hover:underline shrink-0"
                  >
                    {boletoFile ? 'Trocar' : 'Vincular'}
                  </button>
                  {boletoFile && (
                    <button
                      type="button"
                      onClick={() => setBoletoFile(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Remover"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {form.pagamento === 'pix' && (
                <Field className="mb-4">
                  <Label>Chave PIX</Label>
                  <Input
                    type="text"
                    placeholder="CNPJ, CPF, e-mail, telefone ou chave aleatória"
                    value={form.pix_chave}
                    onChange={set('pix_chave')}
                  />
                </Field>
              )}

              {form.pagamento === 'transferencia' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                  <Field>
                    <Label>Banco</Label>
                    <Input type="text" placeholder="Ex: Bradesco" value={form.banco} onChange={set('banco')} />
                  </Field>
                  <Field>
                    <Label>Agência</Label>
                    <Input type="text" placeholder="0000-0" value={form.agencia} onChange={set('agencia')} />
                  </Field>
                  <Field>
                    <Label>C/C</Label>
                    <Input type="text" placeholder="00000-0" value={form.conta_corrente} onChange={set('conta_corrente')} />
                  </Field>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Observações e Solicitante</SectionTitle>
              <div className="space-y-4">
                <Field>
                  <Label>Observação</Label>
                  <Textarea
                    rows={3}
                    placeholder="Observações adicionais..."
                    value={form.observacao}
                    onChange={set('observacao')}
                  />
                </Field>
                <Field>
                  <Label required>Solicitado por</Label>
                  <Input
                    type="text"
                    placeholder="Nome do solicitante"
                    value={form.solicitado_por}
                    onChange={set('solicitado_por')}
                  />
                </Field>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Anexos</SectionTitle>
              <p className="text-xs text-slate-500 mb-3">
                Até {MAX_ANEXOS} arquivos · máx. 10 MB cada (PDF, imagens, Word, Excel).
                Imagens e PDFs entram no PDF gerado.
              </p>
              <input
                ref={anexosInputRef}
                type="file"
                multiple
                accept={ANEXO_ACCEPT}
                className="hidden"
                onChange={handleAnexosChange}
              />
              <button
                type="button"
                onClick={() => anexosInputRef.current?.click()}
                disabled={anexos.length >= MAX_ANEXOS}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                Anexar arquivos ({anexos.length}/{MAX_ANEXOS})
              </button>
              {anexos.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {anexos.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2"
                    >
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                        <p className="text-[11px] text-slate-400">{formatBytes(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAnexo(index)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Remover"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 sticky top-6">
              <h3 className="text-sm font-bold text-slate-800">Ações</h3>

              <button
                onClick={handleGerarPdf}
                disabled={generating || !form.prestador.trim() || !form.valor.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-50 transition-colors"
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
                  : <><Download className="w-4 h-4" /> Gerar PDF para Impressão</>
                }
              </button>

              <button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setAnexos([]);
                  setNotaFile(null);
                  setReciboFile(null);
                  setBoletoFile(null);
                  lastLookupRef.current = '';
                  setCnpjStatus('idle');
                  setCnpjMessage('');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Limpar formulário
              </button>

              <p className="text-xs text-slate-400 text-center">
                Prestador e Valor são obrigatórios para gerar o PDF.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Lembretes</p>
              <ul className="space-y-1.5 text-xs text-amber-700">
                <li>• Consultar o orçamento mensal antes de contratar serviços.</li>
                <li>• Valores acima de R$ 800,00 — colher assinatura da Diretoria.</li>
                <li>• Mínimo de 10 dias úteis após entrega da nota fiscal no financeiro.</li>
                <li>• Pagamentos via banco: terças e quintas — somente até 10h00.</li>
                <li>• À Vista (caixa): quintas após 14h00. Entregar ordem com mínimo 3 dias de antecedência.</li>
                <li>• Solicitar ao prestador inserir a chave PIX no corpo da nota fiscal.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aprovacao' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Ordens lançadas</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Cada PDF gerado entra aqui e também na fila de Aprovações do Controle e do Financeiro.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{filteredOrdens.length} ordem(ns)</span>
          </div>

          {ordensLoading ? (
            <div className="p-12 flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando ordens...</span>
            </div>
          ) : ordensError ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-sm text-red-600">{ordensError}</p>
              <button
                onClick={loadOrdens}
                className="text-sm font-semibold text-[#004D40] hover:underline"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredOrdens.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-500">Nenhuma ordem de compra lançada</p>
              <p className="text-xs text-slate-400">Gere um PDF na aba Ordem de Compra para lançar a primeira ordem.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Protocolo</th>
                    <th className="px-6 py-3 font-semibold">Prestador</th>
                    <th className="px-6 py-3 font-semibold">Setor / CRD</th>
                    <th className="px-6 py-3 font-semibold">Data</th>
                    <th className="px-6 py-3 font-semibold text-right">Valor</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrdens.map((ordem) => {
                    const status = launchStatusMeta(ordem.status, 'Pago');
                    const setor = [sectorNameById(ordem.servico_sector_id), sectorNameById(ordem.materiais_sector_id)]
                      .filter(Boolean)
                      .filter((name, index, list) => list.indexOf(name) === index)
                      .join(' / ');
                    const crd = [crdNameById(ordem.servico_crd_id), crdNameById(ordem.materiais_crd_id)]
                      .filter(Boolean)
                      .filter((name, index, list) => list.indexOf(name) === index)
                      .join(' / ');
                    const detalhe = [ordem.servico_executado, ordem.materiais_descricao].filter(Boolean).join(' · ');
                    return (
                      <tr key={ordem.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-800">{ordem.protocol || `#${ordem.id}`}</p>
                          <p className="text-xs text-slate-400">{PAGAMENTO_LABEL[String(ordem.pagamento || '')] || 'Pagamento não informado'}</p>
                          {(ordem.nota_file_name || ordem.recibo_file_name || ordem.boleto_file_name) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {ordem.nota_file_name && (
                                <button
                                  type="button"
                                  onClick={() => openOrdemDocumento(ordem.id, 'nota')}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg hover:bg-blue-100"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  Nota
                                </button>
                              )}
                              {ordem.recibo_file_name && (
                                <button
                                  type="button"
                                  onClick={() => openOrdemDocumento(ordem.id, 'recibo')}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg hover:bg-blue-100"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  Recibo
                                </button>
                              )}
                              {ordem.boleto_file_name && (
                                <button
                                  type="button"
                                  onClick={() => openOrdemDocumento(ordem.id, 'boleto')}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg hover:bg-blue-100"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  Boleto
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-slate-900">{ordem.prestador}</p>
                          {detalhe && <p className="text-xs text-slate-400 line-clamp-2 max-w-xs">{detalhe}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <p>{setor || 'Sem setor'}</p>
                          {crd && <p className="text-xs text-slate-400">{crd}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatDate(ordem.data_execucao || ordem.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                          {formatCurrency(Number(ordem.valor) || 0)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold', status.classes)}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-1">
                            {canApproveControl && ordem.status === 'open' && (
                              <>
                                <button
                                  onClick={() => updateOrdemStatus(ordem.id, 'approved')}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Aprovar (Controle)"
                                >
                                  <BadgeCheck className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => updateOrdemStatus(ordem.id, 'cancelled')}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Reprovar"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {canApproveControl && ordem.status === 'approved' && (
                              <button
                                onClick={() => updateOrdemStatus(ordem.id, 'open')}
                                className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Desaprovar"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            {canPayFinance && ordem.status === 'approved' && (
                              <button
                                onClick={() => updateOrdemStatus(ordem.id, 'posted')}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Registrar pagamento"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
