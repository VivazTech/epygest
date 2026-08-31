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
  Plus,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { useToast } from '../context/ToastContext';
import { confirmDelete } from '../lib/confirmAction';
import {
  PERMISSION_RESOURCES,
  type PermissionAction,
  type PermissionResource,
  type RolePermissionRow,
} from '../lib/permissionCatalog';

type UserRole = string;

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

type AppRole = {
  slug: string;
  label: string;
  description?: string | null;
  is_system: boolean;
  sort_order?: number;
};

type EditForm = {
  name: string;
  email: string;
  role: UserRole;
  sector_ids: string[];
  password: string;
};

const FALLBACK_ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  finance: 'Financeiro',
  controle: 'Controle',
  manager: 'Gestor',
  viewer: 'Visualizador',
  diretoria: 'Diretoria',
};

const roleBadgeClass = (role: string) => {
  const map: Record<string, string> = {
    admin: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    finance: 'bg-sky-50 text-sky-800 border-sky-100',
    controle: 'bg-amber-50 text-amber-800 border-amber-100',
    manager: 'bg-violet-50 text-violet-800 border-violet-100',
    viewer: 'bg-slate-50 text-slate-600 border-slate-200',
    diretoria: 'bg-cyan-50 text-cyan-800 border-cyan-100',
  };
  return map[role] || 'bg-slate-50 text-slate-700 border-slate-200';
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Ver',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const emptyPermissionMatrix = (): RolePermissionRow[] =>
  PERMISSION_RESOURCES.map((r) => ({
    resource_key: r.key,
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
  }));

export const UsuariosPage: React.FC = () => {
  const { query: globalQuery } = useSearch();
  const { showSuccess } = useToast();
  const [pageTab, setPageTab] = useState<'usuarios' | 'permissoes'>('usuarios');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
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

  // Permissões
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string>('admin');
  const [permRows, setPermRows] = useState<RolePermissionRow[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permDirty, setPermDirty] = useState(false);
  const [permError, setPermError] = useState('');
  const [catalog, setCatalog] = useState<PermissionResource[]>(PERMISSION_RESOURCES);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [roleActionBusy, setRoleActionBusy] = useState(false);

  const roleLabel = (slug: string) =>
    roles.find((r) => r.slug === slug)?.label || FALLBACK_ROLE_LABEL[slug] || slug;

  const loadRoles = async () => {
    const res = await fetch('/api/roles');
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data)) {
      setRoles(data);
      return data as AppRole[];
    }
    const fallback = Object.entries(FALLBACK_ROLE_LABEL).map(([slug, label], i) => ({
      slug,
      label,
      is_system: true,
      sort_order: (i + 1) * 10,
    }));
    setRoles(fallback);
    return fallback;
  };

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [usersRes, sectorsRes, rolesList] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/sectors'),
        loadRoles(),
      ]);
      const usersData = await usersRes.json().catch(() => null);
      const sectorsData = await sectorsRes.json().catch(() => null);

      if (!usersRes.ok) {
        throw new Error(usersData?.error || 'Não foi possível carregar os usuários.');
      }

      setUsers(Array.isArray(usersData) ? usersData : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
      if (rolesList.length && !rolesList.some((r) => r.slug === selectedRoleSlug)) {
        setSelectedRoleSlug(rolesList[0].slug);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar os usuários.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async (slug: string) => {
    setPermLoading(true);
    setPermError('');
    setPermDirty(false);
    try {
      const [permRes, catRes] = await Promise.all([
        fetch(`/api/roles/${encodeURIComponent(slug)}/permissions`),
        fetch('/api/permissions/catalog'),
      ]);
      const permData = await permRes.json().catch(() => null);
      const catData = await catRes.json().catch(() => null);
      if (Array.isArray(catData)) setCatalog(catData);
      if (!permRes.ok) {
        throw new Error(permData?.error || 'Não foi possível carregar as permissões.');
      }
      setPermRows(Array.isArray(permData) ? permData : emptyPermissionMatrix());
    } catch (err) {
      setPermError(err instanceof Error ? err.message : 'Erro ao carregar permissões.');
      setPermRows(emptyPermissionMatrix());
    } finally {
      setPermLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (pageTab === 'permissoes' && selectedRoleSlug) {
      void loadPermissions(selectedRoleSlug);
    }
  }, [pageTab, selectedRoleSlug]);

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
        roleLabel(user.role),
        user.sector_name,
        ...(user.sector_names ?? [])
      );
    });
  }, [users, searchQuery, roleFilter, sectorFilter, roles]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissionResource[]>();
    for (const resource of catalog) {
      const list = groups.get(resource.group) || [];
      list.push(resource);
      groups.set(resource.group, list);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const selectedRole = roles.find((r) => r.slug === selectedRoleSlug) || null;
  const isAdminMatrix = selectedRoleSlug === 'admin';

  const emptyForm = (): EditForm => ({
    name: '',
    email: '',
    role: roles.find((r) => r.slug === 'viewer')?.slug || roles[0]?.slug || 'viewer',
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

  const setPermissionFlag = (
    resourceKey: string,
    field: 'can_view' | 'can_create' | 'can_edit' | 'can_delete',
    value: boolean
  ) => {
    if (isAdminMatrix) return;
    setPermDirty(true);
    setPermRows((prev) =>
      prev.map((row) => {
        if (row.resource_key !== resourceKey) return row;
        if (field === 'can_view') {
          return {
            ...row,
            can_view: value,
            can_create: value ? row.can_create : false,
            can_edit: value ? row.can_edit : false,
            can_delete: value ? row.can_delete : false,
          };
        }
        if (!row.can_view && value) {
          return { ...row, can_view: true, [field]: true };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const savePermissions = async () => {
    if (isAdminMatrix) return;
    setPermSaving(true);
    setPermError('');
    try {
      const res = await fetch(`/api/roles/${encodeURIComponent(selectedRoleSlug)}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: permRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPermError(data.error || 'Erro ao salvar permissões.');
        return;
      }
      setPermDirty(false);
      showSuccess('Permissões salvas. Usuários precisam entrar de novo para atualizar o menu.');
    } finally {
      setPermSaving(false);
    }
  };

  const createRole = async () => {
    if (!newRoleLabel.trim()) return;
    setRoleActionBusy(true);
    setPermError('');
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newRoleLabel.trim(),
          description: newRoleDescription.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPermError(data.error || 'Erro ao criar nível.');
        return;
      }
      showSuccess(`Nível "${data.label}" criado.`);
      setCreatingRole(false);
      setNewRoleLabel('');
      setNewRoleDescription('');
      await loadRoles();
      if (data.slug) setSelectedRoleSlug(data.slug);
    } finally {
      setRoleActionBusy(false);
    }
  };

  const deleteRole = async (slug: string) => {
    if (!confirmDelete(`o nível "${roleLabel(slug)}"`)) return;
    setRoleActionBusy(true);
    setPermError('');
    try {
      const res = await fetch(`/api/roles/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPermError(data.error || 'Erro ao excluir nível.');
        return;
      }
      showSuccess('Nível excluído.');
      const next = await loadRoles();
      setSelectedRoleSlug(next[0]?.slug || 'admin');
    } finally {
      setRoleActionBusy(false);
    }
  };

  const showModal = Boolean(editForm && (creating || editingUser));
  const pageTabs = [
    { id: 'usuarios' as const, label: 'Usuários', icon: Users },
    { id: 'permissoes' as const, label: 'Permissões', icon: KeyRound },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Usuários</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre perfis e defina o que cada nível pode ver e fazer no sistema.
          </p>
        </div>
        {pageTab === 'usuarios' && (
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
        )}
      </div>

      <div className="flex items-center gap-2 p-1 bg-slate-100 w-fit rounded-2xl">
        {pageTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPageTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
              pageTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {pageTab === 'usuarios' && (
        <>
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
              {roles.map((role) => (
                <option key={role.slug} value={role.slug}>
                  {role.label}
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
                          roleBadgeClass(user.role)
                        )}
                      >
                        {roleLabel(user.role)}
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
        </>
      )}

      {pageTab === 'permissoes' && (
        <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4">
          <aside className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3 h-fit">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Níveis</p>
              <button
                type="button"
                onClick={() => setCreatingRole((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#004D40] hover:bg-emerald-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo
              </button>
            </div>

            {creatingRole && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
                <input
                  value={newRoleLabel}
                  onChange={(e) => setNewRoleLabel(e.target.value)}
                  placeholder="Nome do nível"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-emerald-500"
                />
                <textarea
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  placeholder="Descrição (opcional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-emerald-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={roleActionBusy || !newRoleLabel.trim()}
                    onClick={() => void createRole()}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#004D40] text-white text-xs font-bold disabled:opacity-50"
                  >
                    Criar nível
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingRole(false);
                      setNewRoleLabel('');
                      setNewRoleDescription('');
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-white"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1 max-h-[28rem] overflow-auto">
              {roles.map((role) => (
                <div
                  key={role.slug}
                  className={cn(
                    'flex items-center gap-1 rounded-xl border transition-colors',
                    selectedRoleSlug === role.slug
                      ? 'border-emerald-200 bg-emerald-50/60'
                      : 'border-transparent hover:bg-slate-50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (permDirty && !window.confirm('Há alterações não salvas. Trocar de nível?')) return;
                      setSelectedRoleSlug(role.slug);
                    }}
                    className="flex-1 text-left px-3 py-2.5 min-w-0"
                  >
                    <p className="text-sm font-bold text-slate-800 truncate">{role.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {role.is_system ? 'Sistema' : 'Personalizado'} · {role.slug}
                    </p>
                  </button>
                  {!role.is_system && (
                    <button
                      type="button"
                      title="Excluir nível"
                      disabled={roleActionBusy}
                      onClick={() => void deleteRole(role.slug)}
                      className="p-2 mr-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedRole?.label || roleLabel(selectedRoleSlug)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAdminMatrix
                    ? 'Administrador sempre tem acesso total.'
                    : selectedRole?.description || 'Marque as telas e ações permitidas para este nível.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isAdminMatrix || permSaving || permLoading || !permDirty}
                onClick={() => void savePermissions()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-50"
              >
                {permSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar permissões
              </button>
            </div>

            {permError && (
              <div className="mx-5 mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {permError}
              </div>
            )}

            {permLoading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Carregando matriz...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="text-left font-bold px-5 py-3 min-w-[220px]">Tela / módulo</th>
                      {(['view', 'create', 'edit', 'delete'] as PermissionAction[]).map((action) => (
                        <th key={action} className="text-center font-bold px-3 py-3 w-24">
                          {ACTION_LABELS[action]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissionGroups.map(([group, resources]) => (
                      <React.Fragment key={group}>
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-y border-slate-100"
                          >
                            {group}
                          </td>
                        </tr>
                        {resources.map((resource) => {
                          const row =
                            permRows.find((p) => p.resource_key === resource.key) || {
                              resource_key: resource.key,
                              can_view: isAdminMatrix,
                              can_create: isAdminMatrix && resource.actions.includes('create'),
                              can_edit: isAdminMatrix && resource.actions.includes('edit'),
                              can_delete: isAdminMatrix && resource.actions.includes('delete'),
                            };
                          return (
                            <tr key={resource.key} className="border-b border-slate-50 hover:bg-slate-50/50">
                              <td className="px-5 py-3">
                                <p className="font-semibold text-slate-800">{resource.label}</p>
                                {resource.description && (
                                  <p className="text-[11px] text-slate-400 mt-0.5">{resource.description}</p>
                                )}
                              </td>
                              {(['view', 'create', 'edit', 'delete'] as PermissionAction[]).map((action) => {
                                const field =
                                  action === 'view'
                                    ? 'can_view'
                                    : action === 'create'
                                      ? 'can_create'
                                      : action === 'edit'
                                        ? 'can_edit'
                                        : 'can_delete';
                                const available = resource.actions.includes(action) || isAdminMatrix;
                                const checked = isAdminMatrix
                                  ? available
                                  : Boolean(row[field as keyof RolePermissionRow]);
                                return (
                                  <td key={action} className="px-3 py-3 text-center">
                                    {available ? (
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={isAdminMatrix}
                                        onChange={(e) =>
                                          setPermissionFlag(resource.key, field, e.target.checked)
                                        }
                                        className="w-4 h-4 accent-[#004D40] disabled:opacity-60"
                                      />
                                    ) : (
                                      <span className="text-slate-200">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
                  {creating ? 'Preencha os dados para criar o acesso.' : editingUser?.email}
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
                  onChange={(e) => setEditForm((p) => (p ? { ...p, role: e.target.value } : p))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                >
                  {roles.map((role) => (
                    <option key={role.slug} value={role.slug}>
                      {role.label}
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
                  placeholder={
                    creating ? 'Mínimo 10 caracteres, com letras e números' : 'Deixe em branco para manter'
                  }
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
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
