/** Acesso confidencial a dados de empréstimos consignados (RH / financeiro). */

import { hasPermission, type RolePermissionRow } from './permissionCatalog.js';

export const EMPRESTIMOS_ACCESS_ROLES = ['admin', 'finance', 'controle'] as const;

export const EMPRESTIMOS_ACESSO_NEGADO_MSG =
  'Dados de empréstimos consignados são confidenciais e restritos ao RH e ao financeiro.';

export const canViewEmprestimosConfidenciais = (
  role?: string | null,
  permissions?: RolePermissionRow[] | null
): boolean => {
  if (role === 'admin') return true;
  if (permissions?.length) {
    return hasPermission(permissions, 'emprestimos', 'view', role ?? undefined);
  }
  return (EMPRESTIMOS_ACCESS_ROLES as readonly string[]).includes(String(role ?? ''));
};
