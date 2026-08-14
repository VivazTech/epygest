import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Edit2,
  Save,
  X,
  Shield,
  Building2,
  Loader2,
  Search,
  UserPlus,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { useToast } from '../context/ToastContext';

type UserRole = 'admin' | 'finance' | 'controle' | 'manager' | 'viewer' | 'diretoria';

type UserRow = {
  id: number | string;
  name: string;
  email: string;
  role: UserRole;
  sector_id: number | null;
  sector_ids?: number[];
  sector_names?: string[];
  sector_name?: string | null;
  created_at?: string;
};

type SectorRow = {
  id: number | string;
  name: string;
};

type EditForm = {
  name: string;
  email: string;
  role: UserRole;
  sector_ids: string[];
  password: string;
};

const roleLabel: Record<UserRole, string> = {
  admin: 'Administrador',
  finance: 'Financeiro',
  controle: 'Controle',
  manager: 'Gestor',
  viewer: 'Visualizador',
  diretoria: 'Diretoria',
};

const roleBadgeClass: Record<UserRole, string> = {
  admin: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  finance: 'bg-sky-50 text-sky-800 border-sky-100',
  controle: 'bg-amber-50 text-amber-800 border-amber-100',
  manager: 'bg-violet-50 text-violet-800 border-violet-100',
  viewer: 'bg-slate-50 text-slate-600 border-slate-200',
  diretoria: 'bg-cyan-50 text-cyan-800 border-cyan-100',
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const UsuariosPage: React.FC = () => {
  const { query: globalQuery } = useSearch();
  const { showSuccess } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [localQuery, setLocalQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [usersRes, sectorsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/sectors'),
      ]);
      const usersData = await usersRes.json().catch(() => null);
      const sectorsData = await sectorsRes.json().catch(() => null);

      if (!usersRes.ok) {
        throw new Error(usersData?.error || 'Não foi possível carregar os usuários.');
      }

      setUsers(Array.isArray(usersData) ? usersData : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar os usuários.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.role === 'admin').length;
    const withSectors = users.filter(
      (u) => (u.sector_ids && u.sector_ids.length > 0) || u.sector_id
    ).length;
    return { total: users.length, admins, withSectors };
  }, [users]);

  const searchQuery = localQuery.trim() || globalQuery;

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (sectorFilter !== 'all') {
        const ids = (user.sector_ids ?? (user.sector_id ? [Number(user.sector_id)] : [])).map(String);
        if (!ids.includes(sectorFilter)) return false;
      }
      return matchesSearch(
        searchQuery,
        user.name,
        user.email,
        roleLabel[user.role],
        user.sector_name,
        ...(user.sector_names ?? [])
      );
    });
  }, [users, searchQuery, roleFilter, sectorFilter]);

  const emptyForm = (): EditForm => ({
    name: '',
    email: '',
    role: 'viewer',
    sector_ids: [],
    password: '',
  });

  const openCreate = () => {
    setCreating(true);
    setEditingUser(null);
    setSaveError('');
    setEditForm(emptyForm());
  };

  const openEdit = (user: UserRow) => {
    setCreating(false);
    setEditingUser(user);
    setSaveError('');
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      sector_ids: (user.sector_ids ?? (user.sector_id ? [Number(user.sector_id)] : [])).map(String),
      password: '',
    });
  };

  const closeModal = () => {
    if (saving) return;
    setCreating(false);
    setEditingUser(null);
    setEditForm(null);
    setSaveError('');
  };

  const toggleSector = (sectorId: string) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const next = prev.sector_ids.includes(sectorId)
        ? prev.sector_ids.filter((id) => id !== sectorId)
        : [...prev.sector_ids, sectorId];
      return { ...prev, sector_ids: next };
    });
  };

  const saveCreate = async () => {
    if (!editForm) return;
    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.password) {
      setSaveError('Preencha nome, e-mail e senha.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          password: editForm.password,
          role: editForm.role,
          sector_ids: editForm.sector_ids.map(Number).filter((id) => Number.isFinite(id)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || 'Erro ao criar usuário.');
        return;
      }
      showSuccess('Usuário criado com sucesso.');
      setCreating(false);
      setEditForm(null);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingUser || !editForm) return;
    if (!editForm.name.trim() || !editForm.email.trim()) {
      setSaveError('Preencha nome e e-mail.');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          sector_ids: editForm.sector_ids.map(Number).filter((id) => Number.isFinite(id)),
          password: editForm.password || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || 'Erro ao atualizar usuário.');
        return;
      }
      showSuccess('Usuário atualizado com sucesso.');
      setEditingUser(null);
      setEditForm(null);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const showModal = Boolean(editForm && (creating || editingUser));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Usuários</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre e edite perfis, setores e acessos do sistema.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {stats.total} {stats.total === 1 ? 'usuário' : 'usuários'}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Novo usuário
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Administradores</p>
            <p className="text-2xl font-bold text-slate-900">{stats.admins}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Com setor</p>
            <p className="text-2xl font-bold text-slate-900">{stats.withSectors}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail ou setor..."
            className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 md:w-48"
        >
          <option value="all">Todos os perfis</option>
          {(Object.keys(roleLabel) as UserRole[]).map((role) => (
            <option key={role} value={role}>
              {roleLabel[role]}
            </option>
          ))}
        </select>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 md:w-56"
        >
          <option value="all">Todos os setores</option>
          {sectors.map((sector) => (
            <option key={sector.id} value={String(sector.id)}>
              {sector.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Carregando usuários...</span>
        </div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-8 text-center space-y-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-sm font-bold hover:bg-red-50"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-16 text-center">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Nenhum usuário encontrado</p>
          <p className="text-xs text-slate-400 mt-1">Ajuste os filtros ou a busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const sectorText =
              user.sector_names && user.sector_names.length > 0
                ? user.sector_names.join(', ')
                : user.sector_name || 'Sem setor';

            return (
              <article
                key={user.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 hover:border-emerald-100 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#004D40] text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {initialsFromName(user.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{user.name}</h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border',
                      roleBadgeClass[user.role]
                    )}
                  >
                    {roleLabel[user.role]}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-xs text-slate-500 min-h-[2.5rem]">
                  <Building2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                  <span className="leading-relaxed">{sectorText}</span>
                </div>

                <div className="pt-1 mt-auto">
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showModal && editForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {creating ? 'Novo usuário' : 'Editar usuário'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {creating
                    ? 'Preencha os dados para criar o acesso.'
                    : editingUser?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (creating) void saveCreate();
                else void saveEdit();
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, name: e.target.value } : p))}
                  required
                  autoFocus={creating}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-mail</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, email: e.target.value } : p))}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Perfil</label>
                <select
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm((p) => (p ? { ...p, role: e.target.value as UserRole } : p))
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                >
                  {(Object.keys(roleLabel) as UserRole[]).map((role) => (
                    <option key={role} value={role}>
                      {roleLabel[role]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setores</label>
                <div className="max-h-36 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm overflow-auto space-y-2">
                  {sectors.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum setor cadastrado.</p>
                  ) : (
                    sectors.map((sector) => {
                      const sectorId = String(sector.id);
                      const checked = editForm.sector_ids.includes(sectorId);
                      return (
                        <label key={sector.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSector(sectorId)}
                          />
                          <span>{sector.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {creating ? 'Senha' : 'Nova senha (opcional)'}
                </label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, password: e.target.value } : p))}
                  required={creating}
                  placeholder={creating ? 'Mínimo 10 caracteres, com letras e números' : 'Deixe em branco para manter'}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
                {creating && (
                  <p className="text-[11px] text-slate-400">
                    A senha precisa ter pelo menos 10 caracteres, com letras e números.
                  </p>
                )}
              </div>

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {saveError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : creating ? (
                    <UserPlus className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {creating ? 'Criar usuário' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
