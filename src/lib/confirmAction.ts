/** Confirmação padrão antes de excluir permanentemente. */
export const confirmDelete = (label = 'este item') =>
  window.confirm(`Deseja realmente excluir ${label}? Esta ação não pode ser desfeita.`);

/** Confirmação padrão antes de cancelar um lançamento ou solicitação. */
export const confirmCancel = (label = 'este lançamento') =>
  window.confirm(`Deseja realmente cancelar ${label}?`);
