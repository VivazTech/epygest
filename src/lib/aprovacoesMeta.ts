export type AprovacaoTipo =
  | 'comanda'
  | 'manual'
  | 'requisicao'
  | 'nota'
  | 'danfe'
  | 'mensalidade';

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
  reference_date: string;
  issue_date: string | null;
  amount: number | null;
  status: string;
  flow_stage: string | null;
  user_name: string | null;
  file_path: string | null;
  file_name: string | null;
  fornecedor: string | null;
  vencimento: string | null;
  assinado?: boolean;
  alerta_vencimento?: boolean;
  items_count?: number;
};

export const APROVACAO_TIPOS: Array<{ value: AprovacaoTipo | 'all'; label: string }> = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'comanda', label: 'Comandas' },
  { value: 'manual', label: 'Lançamentos Manuais' },
  { value: 'requisicao', label: 'Requisições' },
  { value: 'nota', label: 'Notas de Serviço' },
  { value: 'danfe', label: 'DANFE' },
  { value: 'mensalidade', label: 'Mensalidades' },
];

export const tipoLabel = (type: AprovacaoTipo) =>
  APROVACAO_TIPOS.find((t) => t.value === type)?.label ?? type;

export const tipoBadgeClass = (type: AprovacaoTipo) => {
  const map: Record<AprovacaoTipo, string> = {
    comanda: 'bg-violet-100 text-violet-700',
    manual: 'bg-sky-100 text-sky-700',
    requisicao: 'bg-amber-100 text-amber-800',
    nota: 'bg-teal-100 text-teal-700',
    danfe: 'bg-indigo-100 text-indigo-700',
    mensalidade: 'bg-pink-100 text-pink-700',
  };
  return map[type] || 'bg-slate-100 text-slate-700';
};

export const statusMeta = (item: AprovacaoItem) => {
  if (item.type === 'manual') {
    if (item.status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (item.status === 'posted') return { label: 'Baixado', classes: 'bg-emerald-100 text-emerald-700' };
    if (item.status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  if (item.type === 'nota' || item.type === 'danfe') {
    const flow = item.flow_stage || item.status;
    if (flow === 'paid' || item.status === 'paid') return { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' };
    if (flow === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    if (flow === 'control_approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (item.status === 'overdue') return { label: 'Vencido', classes: 'bg-red-100 text-red-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  if (item.type === 'comanda' || item.type === 'requisicao') {
    if (item.status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (item.status === 'posted') return { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' };
    if (item.status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  if (item.type === 'mensalidade') {
    if (item.status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (item.status === 'posted') return { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' };
    if (item.status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  }
  return { label: item.status, classes: 'bg-slate-100 text-slate-700' };
};

export const isPendingForRole = (
  item: AprovacaoItem,
  actingSector: 'controle' | 'financeiro'
) => {
  if (item.type === 'manual') {
    if (actingSector === 'controle') return item.status === 'open';
    return item.status === 'approved';
  }
  if (item.type === 'nota' || item.type === 'danfe') {
    const flow = item.flow_stage || 'control_pending';
    if (actingSector === 'controle') return flow === 'control_pending';
    return flow === 'control_approved';
  }
  if (item.type === 'comanda' || item.type === 'requisicao' || item.type === 'mensalidade') {
    if (actingSector === 'controle') return item.status === 'open';
    return item.status === 'approved';
  }
  return false;
};
