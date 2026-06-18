import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, Edit2, Save, X, Trash2 } from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

type UserRow = {
  id: number | string;
  name: string;
  email: string;
  role: 'admin' | 'finance' | 'controle' | 'manager' | 'viewer';
  sector_id: number | null;
  sector_ids?: number[];
  sector_names?: string[];
  sector_name?: string | null;
  created_at?: string;
};

const roleLabel: Record<UserRow['role'], string> = {
  admin: 'Administrador',
  finance: 'Financeiro',
  controle: 'Controle',
  manager: 'Gestor',
  viewer: 'Visualizador',
};

export const UsuariosPage: React.FC = () => {
  const { query } = useSearch();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'finance' | 'controle' | 'manager' | 'viewer'>('viewer');
  const [currentUserId, setCurrentUserId] = useState<number | string | null>(null);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer',
    sector_ids: [] as string[],
  });

  const loadAll = async () => {
    const [usersRes, sectorsRes] = await Promise.all([
      fetch('/api/users').then((res) => res.json()),
      fetch('/api/sectors').then((res) => res.json()),
    ]);
    setUsers(Array.isArray(usersRes) ? usersRes : []);
    setSectors(Array.isArray(sectorsRes) ? sectorsRes : []);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role) setCurrentUserRole(parsed.role);
        if (parsed?.id !== undefined && parsed?.id !== null) setCurrentUserId(String(parsed.id));
      }
    } catch {
      // ignora erro de parse
    }
    loadAll();
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        matchesSearch(
          query,
          user.name,
          user.email,
          user.role,
          user.sector_name,
          ...(user.sector_names ?? [])
        )
      ),
    [users, query]
  );

  const deleteUser = async (user: UserRow) => {
    if (currentUserRole !== 'admin') {
      alert('Apenas administradores podem excluir usuários.');
      return;
    }
    if (currentUserId !== null && String(user.id) === String(currentUserId)) {
      alert('Você não pode excluir seu próprio usuário.');
      return;
    }
    if (!window.confirm(`Deseja realmente excluir o usuário "${user.name}"?`)) return;

    // A autorização é feita no servidor a partir do cookie de sessão (token),
    // não de campos enviados pelo cliente.
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao excluir usuário');
      return;
    }
    loadAll();
  };

  const toggleSectorSelection = (current: string[], sectorId: string) => {
    if (current.includes(sectorId)) return current.filter((id) => id !== sectorId);
    return [...current, sectorId];
  };

  const resetNewUserForm = () => {
    setNewUser({ name: '', email: '', password: '', role: 'viewer', sector_ids: [] });
  };

  const closeNewUserModal = () => {
    setShowNewUserModal(false);
    resetNewUserForm();
  };

  const createUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      alert('Preencha nome, e-mail e senha.');
      return;
    }
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        role: newUser.role,
        sector_ids: newUser.sector_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao criar usuário');
      return;
    }
    closeNewUserModal();
    loadAll();
  };

  const startEdit = (user: UserRow) => {
    setEditingId(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      sector_ids: (user.sector_ids ?? (user.sector_id ? [Number(user.sector_id)] : [])).map((id) => String(id)),
      password: '',
    });
  };

  const saveEdit = async (id: number | string) => {
    if (id === undefined || id === null || String(id).trim() === '') {
      alert('ID de usuário inválido para atualização.');
      return;
    }
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        sector_ids: (editForm.sector_ids ?? []).map((value: string) => Number(value)).filter((value: number) => Number.isFinite(value)),
        password: editForm.password || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao atualizar usuário');
      return;
    }
    setEditingId(null);
    setEditForm({});
    loadAll();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gestão de Usuários</h2>
          <p className="text-slate-500 text-sm">Cadastre usuários, defina perfis e setor responsável.</p>
        </div>
        <button
          onClick={() => setShowNewUserModal(true)}
          className="inline-flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span className="font-bold text-sm">Adicionar usuário</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">E-mail</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Perfil</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Setor</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const editing = editingId === user.id;
              return (
                <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-800">
                    {editing ? (
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((p: any) => ({ ...p, name: e.target.value }))}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                      />
                    ) : user.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {editing ? (
                      <input
                        value={editForm.email}
                        onChange={(e) => setEditForm((p: any) => ({ ...p, email: e.target.value }))}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                      />
                    ) : user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {editing ? (
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm((p: any) => ({ ...p, role: e.target.value }))}
                        className="w-40 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="viewer">Visualizador</option>
                        <option value="manager">Gestor</option>
                        <option value="finance">Financeiro</option>
                        <option value="controle">Controle</option>
                        <option value="admin">Administrador</option>
                      </select>
                    ) : roleLabel[user.role]}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <div className="w-56 h-24 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm overflow-auto space-y-1">
                          {sectors.map((sector: any) => {
                            const sectorId = String(sector.id);
                            const checked = (editForm.sector_ids ?? []).includes(sectorId);
                            return (
                              <label key={sector.id} className="flex items-center gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setEditForm((p: any) => ({
                                      ...p,
                                      sector_ids: toggleSectorSelection(p.sector_ids ?? [], sectorId),
                                    }))
                                  }
                                />
                                <span>{sector.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <input
                          type="password"
                          value={editForm.password}
                          onChange={(e) => setEditForm((p: any) => ({ ...p, password: e.target.value }))}
                          placeholder="Nova senha (opcional)"
                          className="w-48 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    ) : ((user.sector_names && user.sector_names.length > 0 ? user.sector_names.join(', ') : (user.sector_name || 'Sem setor')))}
                  </td>
                  <td className="px-4 py-3">
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(user.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(user)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Editar
                        </button>
                        {currentUserRole === 'admin' && (
                          <button
                            onClick={() => deleteUser(user)}
                            disabled={currentUserId !== null && String(currentUserId) === String(user.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNewUserModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-slate-500" />
                <h3 className="text-xl font-bold text-slate-900">Novo usuário</h3>
              </div>
              <button onClick={closeNewUserModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUser();
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome</label>
                <input
                  value={newUser.name}
                  onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-mail</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  placeholder="usuario@vivazcataratas.com.br"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Senha</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Senha temporária"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Perfil</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                >
                  <option value="viewer">Visualizador</option>
                  <option value="manager">Gestor</option>
                  <option value="finance">Financeiro</option>
                  <option value="controle">Controle</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setores</label>
                <div className="max-h-36 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm overflow-auto space-y-2">
                  {sectors.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum setor cadastrado.</p>
                  ) : (
                    sectors.map((sector: any) => {
                      const sectorId = String(sector.id);
                      const checked = newUser.sector_ids.includes(sectorId);
                      return (
                        <label key={sector.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setNewUser((p) => ({ ...p, sector_ids: toggleSectorSelection(p.sector_ids, sectorId) }))
                            }
                          />
                          <span>{sector.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeNewUserModal}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Criar usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
