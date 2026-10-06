/** Fluxo de lançamentos: open → Controle → Financeiro.
 *  Lançamentos de estagiário: pending_manager → Gestor do setor → Controle → Financeiro. */

export const ESTAGIARIO_ROLE = 'estagiario';

export const LAUNCH_FLOW_NEXT_STATUSES = ['open', 'approved', 'cancelled', 'posted'] as const;

export function isEstagiarioRole(role: string | null | undefined): boolean {
  return String(role || '') === ESTAGIARIO_ROLE;
}

export function initialLaunchStatus(role: string | null | undefined): 'pending_manager' | 'open' {
  return isEstagiarioRole(role) ? 'pending_manager' : 'open';
}

export function initialInvoiceFlowStage(
  role: string | null | undefined
): 'manager_pending' | 'control_pending' {
  return isEstagiarioRole(role) ? 'manager_pending' : 'control_pending';
}

export function launchStatusMeta(status: string, postedLabel = 'Pago') {
  if (status === 'pending_manager') {
    return { label: 'Aguardando Gestor', classes: 'bg-violet-100 text-violet-700' };
  }
  if (status === 'approved') {
    return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
  }
  if (status === 'posted') {
    return { label: postedLabel, classes: 'bg-emerald-100 text-emerald-700' };
  }
  if (status === 'cancelled') {
    return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
  }
  return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
}

/** Edição permitida só para admin/gestor e só antes da aprovação do Controle. */
export function canEditLaunchRole(role: string | null | undefined): boolean {
  const r = String(role || '');
  return r === 'admin' || r === 'manager';
}

/** Status de lançamentos (manual/estorno/req/comanda): editável se pending_manager ou open. */
export function isLaunchStatusEditableBeforeControl(status: string | null | undefined): boolean {
  const s = String(status || 'open');
  return s === 'pending_manager' || s === 'open';
}

/** Fluxo de notas/DANFE: editável em manager_pending ou control_pending. */
export function isInvoiceFlowEditableBeforeControl(flow: string | null | undefined): boolean {
  const f = String(flow || 'control_pending');
  return f === 'manager_pending' || f === 'control_pending';
}

/** Filtro de status nas listas de lançamentos. */
export const LAUNCH_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending_manager', label: 'Aguardando Gestor' },
  { value: 'open', label: 'Aguardando Controle' },
  { value: 'approved', label: 'Aprovado Controle' },
  { value: 'posted', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
] as const;

/** Período inclusivo (YYYY-MM-DD). Sem from/to = sem filtro. */
export function matchesDatePeriod(dateValue: unknown, from: string, to: string) {
  if (!from && !to) return true;
  const d = String(dateValue || '').slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function validateLaunchFlowStatus(
  role: string,
  current: string,
  next: string
): { ok: true } | { ok: false; status: number; error: string } {
  const isAdmin = role === 'admin';
  const isControle = role === 'controle' || isAdmin;
  const isFinance = role === 'finance' || isAdmin;
  const isManager = role === 'manager' || isAdmin;
  const isEstagiario = isEstagiarioRole(role);

  if (next === 'approved') {
    if (!isControle) return { ok: false, status: 403, error: 'Apenas Controle (ou admin) pode aprovar.' };
    if (current === 'pending_manager') {
      return {
        ok: false,
        status: 400,
        error: 'O lançamento precisa ser aprovado pelo gestor do setor antes do Controle.',
      };
    }
    if (current !== 'open') {
      return { ok: false, status: 400, error: 'Só é possível aprovar lançamentos em aberto.' };
    }
  } else if (next === 'posted') {
    if (!isFinance) return { ok: false, status: 403, error: 'Apenas Financeiro (ou admin) pode baixar/pagar.' };
    if (current !== 'approved') {
      return {
        ok: false,
        status: 400,
        error: 'O lançamento precisa ser aprovado pelo Controle antes do pagamento.',
      };
    }
  } else if (next === 'cancelled') {
    if (current === 'posted') {
      return { ok: false, status: 400, error: 'Não é possível cancelar um lançamento já baixado.' };
    }
    if (!['pending_manager', 'open', 'approved'].includes(current)) {
      return { ok: false, status: 400, error: 'Este lançamento já está cancelado.' };
    }
    if (role === 'finance') {
      return { ok: false, status: 403, error: 'Financeiro não cancela lançamentos.' };
    }
    if (!(isControle || isAdmin || isManager || isEstagiario)) {
      return { ok: false, status: 403, error: 'Você não pode cancelar este lançamento.' };
    }
  } else if (next === 'open') {
    if (current === 'pending_manager') {
      if (!isManager) {
        return { ok: false, status: 403, error: 'Apenas o gestor do setor (ou admin) pode aprovar este lançamento.' };
      }
      return { ok: true };
    }
    if (!isControle) {
      return { ok: false, status: 403, error: 'Apenas Controle (ou admin) pode devolver o lançamento.' };
    }
    if (current !== 'approved') {
      return { ok: false, status: 400, error: 'Só é possível devolver lançamentos aprovados.' };
    }
  }
  return { ok: true };
}
