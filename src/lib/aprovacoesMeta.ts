export type AprovacaoTipo =
  | 'comanda'
  | 'manual'
  | 'estorno'
  | 'requisicao'
  | 'nota'
  | 'danfe'
  | 'mensalidade'
  | 'ordem';

export type AprovacaoActingSector = 'gestor' | 'controle' | 'financeiro' | 'diretoria';

export type AprovacaoItem = {
  key: string;
  type: AprovacaoTipo;
  source_id: number;
  sector_id: number | null;
  sector_name: string | null;
  crd_code: string | null;
  crd_name: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  protocol?: string | null;
  invoice_number?: string | null;
  reference_date: string;
  issue_date: string | null;
  amount: number | null;
  status: string;
  flow_stage: string | null;
  user_name: string | null;
  file_path: string | null;
  file_name: string | null;
  recibo_file_path?: string | null;
  recibo_file_name?: string | null;
  boleto_file_path?: string | null;
  boleto_file_name?: string | null;
  fornecedor: string | null;
  vencimento: string | null;
  assinado?: boolean;
  alerta_vencimento?: boolean;
  items_count?: number;
};

/** Limiar: valores acima de R$ 800 exigem revisão da Diretoria (R$ 800,01 já entra). */
export const DIRETORIA_AMOUNT_THRESHOLD = 800;

/**
 * Quando true, lançamentos acima do limiar só seguem ao Financeiro após
 * aprovação do Controle E da Diretoria.
 * Mantido false até o treinamento da Diretoria — o fluxo atual permanece.
 */
export const DIRETORIA_APPROVAL_ENFORCED = false;

export const exceedsDiretoriaThreshold = (amount: unknown): boolean => {
  const n = Number(amount);
  return Number.isFinite(n) && n > DIRETORIA_AMOUNT_THRESHOLD;
};

export const APROVACAO_TIPOS: Array<{ value: AprovacaoTipo | 'all'; label: string }> = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'comanda', label: 'Comandas' },
  { value: 'manual', label: 'Lançamentos Manuais' },
  { value: 'estorno', label: 'Estornos' },
  { value: 'requisicao', label: 'Requisições' },
  { value: 'nota', label: 'Notas de Serviço' },
  { value: 'danfe', label: 'DANFE' },
  { value: 'mensalidade', label: 'Mensalidades' },
  { value: 'ordem', label: 'Ordens de Compra' },
];

export const tipoLabel = (type: AprovacaoTipo) =>
  APROVACAO_TIPOS.find((t) => t.value === type)?.label ?? type;

export const tipoBadgeClass = (type: AprovacaoTipo) => {
  const map: Record<AprovacaoTipo, string> = {
    comanda: 'bg-violet-100 text-violet-700',
    manual: 'bg-sky-100 text-sky-700',
    estorno: 'bg-rose-100 text-rose-700',
    requisicao: 'bg-amber-100 text-amber-800',
    nota: 'bg-teal-100 text-teal-700',
    danfe: 'bg-indigo-100 text-indigo-700',
    mensalidade: 'bg-pink-100 text-pink-700',
    ordem: 'bg-emerald-100 text-emerald-800',
  };
  return map[type] || 'bg-slate-100 text-slate-700';
};

export const statusMeta = (item: AprovacaoItem) => {
  if (item.type === 'nota' || item.type === 'danfe') {
    const flow = item.flow_stage || item.status;
    if (flow === 'paid' || item.status === 'paid') return { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' };
    if (flow === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    if (flow === 'diretoria_pending' || flow === 'pending_diretoria') {
      return { label: 'Aguardando Diretoria', classes: 'bg-cyan-100 text-cyan-800' };
    }
    if (flow === 'control_approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (flow === 'manager_pending') return { label: 'Aguardando Gestor', classes: 'bg-violet-100 text-violet-700' };
    if (item.status === 'overdue') return { label: 'Vencido', classes: 'bg-red-100 text-red-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  if (item.status === 'pending_manager') {
    return { label: 'Aguardando Gestor', classes: 'bg-violet-100 text-violet-700' };
  }
  if (item.status === 'pending_diretoria' || item.status === 'diretoria_pending') {
    return { label: 'Aguardando Diretoria', classes: 'bg-cyan-100 text-cyan-800' };
  }
  if (item.type === 'manual' || item.type === 'estorno') {
    if (item.status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (item.status === 'posted') {
      return item.type === 'estorno'
        ? { label: 'Recebido', classes: 'bg-emerald-100 text-emerald-700' }
        : { label: 'Baixado', classes: 'bg-emerald-100 text-emerald-700' };
    }
    if (item.status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  if (item.type === 'comanda' || item.type === 'requisicao' || item.type === 'mensalidade' || item.type === 'ordem') {
    if (item.status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (item.status === 'posted') return { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' };
    if (item.status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  return { label: item.status, classes: 'bg-slate-100 text-slate-700' };
};

export const isPendingForRole = (
  item: AprovacaoItem,
  actingSector: AprovacaoActingSector
) => {
  if (item.type === 'nota' || item.type === 'danfe') {
    const flow = item.flow_stage || 'control_pending';
    if (actingSector === 'gestor') return flow === 'manager_pending';
    if (actingSector === 'controle') return flow === 'control_pending';
    if (actingSector === 'diretoria') {
      // Futuro (DIRETORIA_APPROVAL_ENFORCED): flow === 'diretoria_pending'
      return DIRETORIA_APPROVAL_ENFORCED && (flow === 'diretoria_pending' || flow === 'pending_diretoria');
    }
    // Financeiro
    if (DIRETORIA_APPROVAL_ENFORCED && exceedsDiretoriaThreshold(item.amount)) {
      return flow === 'diretoria_approved';
    }
    return flow === 'control_approved';
  }
  if (actingSector === 'gestor') return item.status === 'pending_manager';
  if (actingSector === 'controle') return item.status === 'open';
  if (actingSector === 'diretoria') {
    return (
      DIRETORIA_APPROVAL_ENFORCED &&
      (item.status === 'pending_diretoria' || item.status === 'diretoria_pending')
    );
  }
  // Financeiro (tipos com status)
  if (DIRETORIA_APPROVAL_ENFORCED && exceedsDiretoriaThreshold(item.amount)) {
    return item.status === 'diretoria_approved';
  }
  return item.status === 'approved';
};
