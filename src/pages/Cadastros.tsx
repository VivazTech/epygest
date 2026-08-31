import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Plus,
  Edit2,
  Trash2,
  Layers,
  Users,
  Briefcase,
  ChevronRight,
  ChevronDown,
  Upload,
  FolderOpen,
  UserRound,
  Coins
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { SearchableSelect } from '../components/SearchableSelect';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { confirmCancel, confirmDelete } from '../lib/confirmAction';

export const CadastrosPage: React.FC = () => {
  const { query } = useSearch();
  const [activeTab, setActiveTab] = useState('categorias');
  const [categories, setCategories] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [cargos, setCargos] = useState<any[]>([]);
  const [newCargoForm, setNewCargoForm] = useState({ name: '', sector_id: '' });
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [newColaboradorForm, setNewColaboradorForm] = useState({
    nome: '',
    funcao_id: '',
    sector_id: '',
  });
  const [newSectorForm, setNewSectorForm] = useState({ name: '', budget_limit: '' });
  const [editingSectorId, setEditingSectorId] = useState<number | null>(null);
  const [editSectorForm, setEditSectorForm] = useState({ name: '', budget_limit: '' });
  const [savingSector, setSavingSector] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newCrdForm, setNewCrdForm] = useState({
    natureza: 'O',
    code: '',
    name: '',
    sector_id: '',
    saldo_anterior: '',
    previsto_mes: '',
    disponivel_mes: '',
    realizado_mes: '',
    saldo: '',
  });
  const [editingCrdId, setEditingCrdId] = useState<number | null>(null);
  const [editCrdForm, setEditCrdForm] = useState({
    natureza: 'O',
    code: '',
    name: '',
    sector_id: '',
    saldo_anterior: '0',
    previsto_mes: '0',
    disponivel_mes: '0',
    realizado_mes: '0',
    saldo: '0',
    active: true,
  });
  const [isImportingCrd, setIsImportingCrd] = useState(false);
  const [reqForm, setReqForm] = useState({ crd_id: '', date: '', amount: '', description: '' });
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const toggleGroup = (sectorId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) next.delete(sectorId);
      else next.add(sectorId);
      return next;
    });
  };

  const crdsByGroup = useMemo(() => {
    const map = new Map<number, { sector: any; items: any[] }>();
    for (const c of crds) {
      const sid = c.sector_id;
      if (!map.has(sid)) {
        const sector = sectors.find((s: any) => s.id === sid);
        map.set(sid, { sector: sector || { id: sid, name: c.sector_name || 'Sem grupo' }, items: [] });
      }
      map.get(sid)!.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.sector.name || '').localeCompare(b.sector.name || '')
    );
  }, [crds, sectors]);

  const filteredCrdGroups = useMemo(() => {
    if (!query.trim()) return crdsByGroup;
    return crdsByGroup
      .map((g) => ({
        ...g,
        items: g.items.filter((c: any) =>
          matchesSearch(query, c.name, c.code, g.sector.name)
        ),
      }))
      .filter((g) => g.items.length > 0 || matchesSearch(query, g.sector.name));
  }, [crdsByGroup, query]);

  const filteredCategories = useMemo(
    () => categories.filter((cat) => matchesSearch(query, cat.name, cat.type, cat.key)),
    [categories, query]
  );
  const filteredSectors = useMemo(
    () => sectors.filter((sector) => matchesSearch(query, sector.name, sector.budget_limit)),
    [sectors, query]
  );
  const filteredPaymentMethods = useMemo(
    () => paymentMethods.filter((pm) => matchesSearch(query, pm.name, pm.key)),
    [paymentMethods, query]
  );
  const filteredCurrencies = useMemo(
    () => currencies.filter((c) => matchesSearch(query, c.name, c.key)),
    [currencies, query]
  );
  const filteredCargos = useMemo(
    () =>
      cargos.filter((c) =>
        matchesSearch(query, c.name, c.sector_name, c.sector_id)
      ),
    [cargos, query]
  );
  const filteredColaboradores = useMemo(
    () =>
      colaboradores.filter((c) =>
        matchesSearch(
          query,
          c.nome,
          c.cargo_descricao,
          c.ccusto_descricao,
          c.sector_name,
          ...(Array.isArray(c.funcoes) ? c.funcoes.map((f: any) => f.name) : [])
        )
      ),
    [colaboradores, query]
  );

  const funcaoOptions = useMemo(
    () =>
      cargos
        .filter((c) => c.active !== false)
        .map((c) => ({
          value: String(c.id),
          label: c.sector_name ? `${c.name} · ${c.sector_name}` : c.name,
          keywords: `${c.name} ${c.sector_name || ''}`,
        })),
    [cargos]
  );

  const sectorOptions = useMemo(
    () =>
      sectors.map((s: any) => ({
        value: String(s.id),
        label: String(s.name || ''),
        keywords: String(s.name || ''),
      })),
    [sectors]
  );
  const filteredRequisitions = useMemo(
    () =>
      requisitions.filter((r) =>
        matchesSearch(query, r.crd_code, r.crd_name, r.sector_name, r.description, r.date, r.amount, r.status)
      ),
    [requisitions, query]
  );

  const refreshCrds = () => fetch('/api/crds').then(res => res.json()).then(data => setCrds(data));
  const refreshSectors = () => fetch('/api/sectors').then(res => res.json()).then(data => setSectors(data));
  const refreshCargos = () =>
    fetch('/api/cargos')
      .then((res) => res.json())
      .then((data) => setCargos(Array.isArray(data) ? data : []));
  const refreshColaboradores = () =>
    fetch('/api/colaboradores')
      .then((res) => res.json())
      .then((data) => setColaboradores(Array.isArray(data) ? data : []));

  useEffect(() => {
    fetch('/api/categories').then(res => res.json()).then(data => setCategories(data));
    refreshSectors();
    refreshCargos();
    refreshColaboradores();
    fetch('/api/payment-methods').then(res => res.json()).then(data => setPaymentMethods(data));
    fetch('/api/currencies').then(res => res.json()).then(data => setCurrencies(Array.isArray(data) ? data : []));
    refreshCrds();
    fetch('/api/requisitions').then(res => res.json()).then(data => setRequisitions(data));
  }, []);

  const tabs = [
    { id: 'categorias', label: 'Categorias', icon: Layers },
    { id: 'setores', label: 'Setores / Centros de Custo', icon: Briefcase },
    { id: 'colaboradores', label: 'Colaboradores', icon: UserRound },
    { id: 'contas', label: 'Contas Gerenciais', icon: Database },
    { id: 'formas-pagamento', label: 'Formas de Pagamento', icon: Database },
    { id: 'moedas', label: 'Moedas', icon: Coins },
    { id: 'crd', label: 'CRD', icon: Database },
    { id: 'requisicoes', label: 'Requisições Internas', icon: Database },
  ];

  const createCadastro = async () => {
    if (!newName.trim() || !newKey.trim()) {
      alert('Preencha código e nome.');
      return;
    }
    if (activeTab === 'formas-pagamento') {
      const res = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), name: newName.trim(), active: true })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao cadastrar');
        return;
      }
      setNewKey('');
      setNewName('');
      fetch('/api/payment-methods').then(res => res.json()).then(data => setPaymentMethods(data));
      return;
    }
    if (activeTab === 'moedas') {
      const res = await fetch('/api/currencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), name: newName.trim(), active: true })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao cadastrar');
        return;
      }
      setNewKey('');
      setNewName('');
      fetch('/api/currencies').then(res => res.json()).then(data => setCurrencies(Array.isArray(data) ? data : []));
      return;
    }
    if (activeTab === 'crd') {
      const missingRequired = !newCrdForm.natureza || !newCrdForm.code.trim() || !newCrdForm.name.trim() || !newCrdForm.sector_id
        || newCrdForm.saldo_anterior === '' || newCrdForm.previsto_mes === '' || newCrdForm.disponivel_mes === ''
        || newCrdForm.realizado_mes === '' || newCrdForm.saldo === '';
      if (missingRequired) {
        alert('Preencha todos os campos do CRD.');
        return;
      }
      const res = await fetch('/api/crds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          natureza: newCrdForm.natureza,
          code: newCrdForm.code.trim(),
          name: newCrdForm.name.trim(),
          sector_id: parseInt(newCrdForm.sector_id),
          saldo_anterior: parseFloat(newCrdForm.saldo_anterior),
          previsto_mes: parseFloat(newCrdForm.previsto_mes),
          disponivel_mes: parseFloat(newCrdForm.disponivel_mes),
          realizado_mes: parseFloat(newCrdForm.realizado_mes),
          saldo: parseFloat(newCrdForm.saldo),
          active: true
        })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao cadastrar');
        return;
      }
      setNewCrdForm({
        natureza: 'O',
        code: '',
        name: '',
        sector_id: '',
        saldo_anterior: '',
        previsto_mes: '',
        disponivel_mes: '',
        realizado_mes: '',
        saldo: '',
      });
      refreshCrds();
    }
  };

  const createRequisition = async () => {
    if (!reqForm.crd_id || !reqForm.date || !reqForm.amount) {
      alert('Preencha CRD, data e valor.');
      return;
    }
    const res = await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crd_id: parseInt(reqForm.crd_id),
        date: reqForm.date,
        amount: parseFloat(reqForm.amount),
        description: reqForm.description || null
      })
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Erro ao cadastrar requisição');
      return;
    }
    setReqForm({ crd_id: '', date: '', amount: '', description: '' });
    fetch('/api/requisitions').then(res => res.json()).then(data => setRequisitions(data));
    refreshSectors();
  };

  const updateReqStatus = async (id: number, status: 'open' | 'cancelled' | 'posted') => {
    if (status === 'cancelled' && !confirmCancel('esta requisição')) return;
    await fetch(`/api/requisitions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetch('/api/requisitions').then(res => res.json()).then(data => setRequisitions(data));
    refreshSectors();
  };

  const startEditCrd = (crd: any) => {
    setEditingCrdId(crd.id);
    setEditCrdForm({
      natureza: crd.natureza ?? 'O',
      code: crd.code ?? '',
      name: crd.name ?? '',
      sector_id: crd.sector_id ? String(crd.sector_id) : '',
      saldo_anterior: String(crd.saldo_anterior ?? 0),
      previsto_mes: String(crd.previsto_mes ?? 0),
      disponivel_mes: String(crd.disponivel_mes ?? 0),
      realizado_mes: String(crd.realizado_mes ?? 0),
      saldo: String(crd.saldo ?? 0),
      active: crd.active !== false,
    });
  };

  const saveCrdEdit = async () => {
    if (!editingCrdId) return;
    if (!editCrdForm.natureza || !editCrdForm.code.trim() || !editCrdForm.name.trim() || !editCrdForm.sector_id) {
      alert('Preencha natureza, código, nome e grupo.');
      return;
    }

    const res = await fetch(`/api/crds/${editingCrdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        natureza: editCrdForm.natureza,
        code: editCrdForm.code.trim(),
        name: editCrdForm.name.trim(),
        sector_id: parseInt(editCrdForm.sector_id),
        saldo_anterior: parseFloat(editCrdForm.saldo_anterior || '0'),
        previsto_mes: parseFloat(editCrdForm.previsto_mes || '0'),
        disponivel_mes: parseFloat(editCrdForm.disponivel_mes || '0'),
        realizado_mes: parseFloat(editCrdForm.realizado_mes || '0'),
        saldo: parseFloat(editCrdForm.saldo || '0'),
        active: editCrdForm.active,
      })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Erro ao editar CRD');
      return;
    }

    setEditingCrdId(null);
    refreshCrds();
  };

  const cancelCrdEdit = () => {
    setEditingCrdId(null);
    setEditCrdForm({
      natureza: 'O',
      code: '',
      name: '',
      sector_id: '',
      saldo_anterior: '0',
      previsto_mes: '0',
      disponivel_mes: '0',
      realizado_mes: '0',
      saldo: '0',
      active: true,
    });
  };

  const importCrdFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingCrd(true);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/crds/import', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    setIsImportingCrd(false);
    event.target.value = '';

    if (!res.ok) {
      alert(data.error || 'Erro ao importar CRDs');
      return;
    }

    refreshSectors();
    refreshCrds();
    alert(`Importação concluída: ${data.imported ?? 0} CRDs em ${data.groups ?? 0} grupos.`);
  };

  const createCargo = async () => {
    const name = newCargoForm.name.trim();
    if (!name || !newCargoForm.sector_id) {
      alert('Informe o nome da função e o setor.');
      return;
    }
    const res = await fetch('/api/cargos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sector_id: Number(newCargoForm.sector_id) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao cadastrar cargo.');
      return;
    }
    setNewCargoForm({ name: '', sector_id: newCargoForm.sector_id });
    refreshCargos();
  };

  const createSector = async () => {
    const name = newSectorForm.name.trim();
    if (!name) {
      alert('Informe o nome do setor / centro de custo.');
      return;
    }
    setSavingSector(true);
    try {
      const res = await fetch('/api/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          budget_limit: Number(newSectorForm.budget_limit) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Erro ao cadastrar setor.');
        return;
      }
      setNewSectorForm({ name: '', budget_limit: '' });
      await refreshSectors();
      if (data?.id) {
        setNewCargoForm((p) => ({ ...p, sector_id: String(data.id) }));
        setNewColaboradorForm((p) => ({ ...p, sector_id: String(data.id) }));
      }
    } finally {
      setSavingSector(false);
    }
  };

  const startEditSector = (sector: any) => {
    setEditingSectorId(Number(sector.id));
    setEditSectorForm({
      name: String(sector.name || ''),
      budget_limit: String(sector.budget_limit ?? ''),
    });
  };

  const cancelEditSector = () => {
    setEditingSectorId(null);
    setEditSectorForm({ name: '', budget_limit: '' });
  };

  const saveSector = async (sector: any) => {
    const name = editSectorForm.name.trim();
    if (!name) {
      alert('Informe o nome do setor / centro de custo.');
      return;
    }
    setSavingSector(true);
    try {
      const res = await fetch(`/api/sectors/${sector.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          budget_limit: Number(editSectorForm.budget_limit) || 0,
          previous_name: sector.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Erro ao atualizar setor.');
        return;
      }
      cancelEditSector();
      refreshSectors();
      refreshCargos();
      refreshColaboradores();
    } finally {
      setSavingSector(false);
    }
  };

  const deleteSector = async (sector: any) => {
    if (!confirmDelete(`o setor "${sector.name}"`)) return;
    const res = await fetch(`/api/sectors/${sector.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao excluir setor.');
      return;
    }
    refreshSectors();
    refreshCargos();
  };

  const setColaboradorSector = async (colaborador: any, sectorId: string) => {
    const res = await fetch(`/api/colaboradores/${colaborador.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sector_id: sectorId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao atualizar setor / ccusto.');
      return;
    }
    refreshColaboradores();
  };

  const toggleCargoActive = async (cargo: any) => {
    const res = await fetch(`/api/cargos/${cargo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !cargo.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Erro ao atualizar cargo.');
      return;
    }
    refreshCargos();
  };

  const deleteCargo = async (cargo: any) => {
    if (!confirmDelete(`o cargo "${cargo.name}"`)) return;
    const res = await fetch(`/api/cargos/${cargo.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Erro ao excluir cargo.');
      return;
    }
    refreshCargos();
  };

  const createColaborador = async () => {
    const nome = newColaboradorForm.nome.trim();
    if (!nome) {
      alert('Informe o nome do colaborador.');
      return;
    }
    const res = await fetch('/api/colaboradores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome,
        funcao_id: newColaboradorForm.funcao_id ? Number(newColaboradorForm.funcao_id) : null,
        sector_id: newColaboradorForm.sector_id ? Number(newColaboradorForm.sector_id) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao cadastrar colaborador.');
      return;
    }
    setNewColaboradorForm({ nome: '', funcao_id: '', sector_id: '' });
    refreshColaboradores();
  };

  const setColaboradorFuncao = async (colaborador: any, funcaoId: string) => {
    const res = await fetch(`/api/colaboradores/${colaborador.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcao_id: funcaoId ? Number(funcaoId) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao vincular função.');
      return;
    }
    refreshColaboradores();
  };

  const addColaboradorFuncao = async (colaborador: any, funcaoId: string) => {
    if (!funcaoId) return;
    const already = (colaborador.funcoes || []).some((f: any) => String(f.id) === funcaoId);
    if (already) {
      await setColaboradorFuncao(colaborador, funcaoId);
      return;
    }
    const res = await fetch(`/api/colaboradores/${colaborador.id}/funcoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funcao_id: Number(funcaoId),
        as_primary: !(colaborador.funcoes || []).length,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao adicionar função.');
      return;
    }
    refreshColaboradores();
  };

  const removeColaboradorFuncao = async (colaborador: any, cargoId: number, cargoName?: string) => {
    const label = cargoName ? `a função "${cargoName}"` : 'esta função';
    if (!confirmDelete(label)) return;
    const res = await fetch(`/api/colaboradores/${colaborador.id}/funcoes/${cargoId}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Erro ao remover função.');
      return;
    }
    refreshColaboradores();
  };

  const toggleColaboradorActive = async (colaborador: any) => {
    const res = await fetch(`/api/colaboradores/${colaborador.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !colaborador.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Erro ao atualizar colaborador.');
      return;
    }
    refreshColaboradores();
  };

  const deleteColaborador = async (colaborador: any) => {
    if (!confirmDelete(`o colaborador "${colaborador.nome}"`)) return;
    const res = await fetch(`/api/colaboradores/${colaborador.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Erro ao excluir colaborador.');
      return;
    }
    refreshColaboradores();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cadastros e Parametrizações</h2>
          <p className="text-slate-500 text-sm">Gerencie as estruturas fundamentais do seu sistema financeiro.</p>
        </div>
        
        <button className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors">
          <Plus className="w-4 h-4" />
          <span className="text-sm font-bold">Novo Cadastro</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-100 w-fit rounded-2xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === tab.id 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============ CRD — layout de grupos accordion ============ */}
      {activeTab === 'crd' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="w-full text-xs text-slate-500">
              Grupo = Setor/centro de custo. Detalhado/Subgrupo = nome do CRD (ex.: Bar da Piscina, Cafe da manha, cambuza, frigobar).
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newCrdForm.natureza}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, natureza: e.target.value }))}
                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                <option value="O">O</option>
                <option value="M">M</option>
              </select>
              <input
                value={newCrdForm.code}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="CRD"
                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                value={newCrdForm.name}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nome"
                className="w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <select
                value={newCrdForm.sector_id}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, sector_id: e.target.value }))}
                className="w-44 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                <option value="">Setor</option>
                {sectors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                value={newCrdForm.saldo_anterior}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, saldo_anterior: e.target.value }))}
                placeholder="Saldo Anterior"
                className="w-36 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={newCrdForm.previsto_mes}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, previsto_mes: e.target.value }))}
                placeholder="Previsto Mês"
                className="w-36 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={newCrdForm.disponivel_mes}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, disponivel_mes: e.target.value }))}
                placeholder="Disponível Mês"
                className="w-36 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={newCrdForm.realizado_mes}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, realizado_mes: e.target.value }))}
                placeholder="Realizado Mês"
                className="w-36 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={newCrdForm.saldo}
                onChange={(e) => setNewCrdForm((p) => ({ ...p, saldo: e.target.value }))}
                placeholder="Saldo"
                className="w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <button
                onClick={createCadastro}
                className="px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors"
              >
                Adicionar
              </button>
              <label className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors",
                isImportingCrd && "opacity-60 cursor-not-allowed"
              )}>
                <Upload className="w-4 h-4" />
                {isImportingCrd ? 'Importando...' : 'Importar XLS'}
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={importCrdFile}
                  disabled={isImportingCrd}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Accordion de grupos */}
          <div className="divide-y divide-slate-100">
            {filteredCrdGroups.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-slate-400">
                {query ? 'Nenhum resultado encontrado.' : 'Nenhum CRD cadastrado.'}
              </div>
            )}
            {filteredCrdGroups.map((group) => {
              const isOpen = expandedGroups.has(group.sector.id);
              const activeCount = group.items.filter((c: any) => c.active).length;
              return (
                <div key={group.sector.id}>
                  {/* Header do grupo */}
                  <button
                    onClick={() => toggleGroup(group.sector.id)}
                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-50/80 transition-colors text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    }
                    <FolderOpen className={cn("w-5 h-5 shrink-0", isOpen ? "text-[#004D40]" : "text-slate-400")} />
                    <span className="text-sm font-bold text-slate-800 flex-1">{group.sector.name}</span>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                      {activeCount} / {group.items.length} CRDs
                    </span>
                  </button>

                  {/* Itens expandidos */}
                  {isOpen && (
                    <div className="bg-slate-50/40">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr>
                            <th className="pl-16 pr-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Natureza</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CRD</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldo Anterior</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Previsto no Mês</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Disponível Mês</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Realizado Mês</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldo</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-6">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/60">
                          {group.items.map((c: any) => (
                            <tr key={c.id} className="hover:bg-white/60 transition-colors group">
                              {editingCrdId === c.id ? (
                                <>
                                  <td className="pl-16 pr-4 py-3">
                                    <select
                                      value={editCrdForm.natureza}
                                      onChange={(e) => setEditCrdForm((p) => ({ ...p, natureza: e.target.value }))}
                                      className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                    >
                                      <option value="O">O</option>
                                      <option value="M">M</option>
                                    </select>
                                  </td>
                                  <td className="px-4 py-3">
                                    <input
                                      value={editCrdForm.code}
                                      onChange={(e) => setEditCrdForm((p) => ({ ...p, code: e.target.value }))}
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                                      placeholder="CRD"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <input
                                        value={editCrdForm.name}
                                        onChange={(e) => setEditCrdForm((p) => ({ ...p, name: e.target.value }))}
                                        className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm"
                                        placeholder="Nome"
                                      />
                                      <select
                                        value={editCrdForm.sector_id}
                                        onChange={(e) => setEditCrdForm((p) => ({ ...p, sector_id: e.target.value }))}
                                        className="w-44 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                                      >
                                        <option value="">Grupo</option>
                                        {sectors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                      </select>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3"><input type="number" step="0.01" value={editCrdForm.saldo_anterior} onChange={(e) => setEditCrdForm((p) => ({ ...p, saldo_anterior: e.target.value }))} className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs" /></td>
                                  <td className="px-4 py-3"><input type="number" step="0.01" value={editCrdForm.previsto_mes} onChange={(e) => setEditCrdForm((p) => ({ ...p, previsto_mes: e.target.value }))} className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs" /></td>
                                  <td className="px-4 py-3"><input type="number" step="0.01" value={editCrdForm.disponivel_mes} onChange={(e) => setEditCrdForm((p) => ({ ...p, disponivel_mes: e.target.value }))} className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs" /></td>
                                  <td className="px-4 py-3"><input type="number" step="0.01" value={editCrdForm.realizado_mes} onChange={(e) => setEditCrdForm((p) => ({ ...p, realizado_mes: e.target.value }))} className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs" /></td>
                                  <td className="px-4 py-3"><input type="number" step="0.01" value={editCrdForm.saldo} onChange={(e) => setEditCrdForm((p) => ({ ...p, saldo: e.target.value }))} className="w-28 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs" /></td>
                                  <td className="px-4 py-3">
                                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={editCrdForm.active}
                                        onChange={(e) => setEditCrdForm((p) => ({ ...p, active: e.target.checked }))}
                                      />
                                      Ativo
                                    </label>
                                  </td>
                                  <td className="px-4 py-3 text-right pr-6">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={saveCrdEdit}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                      >
                                        Salvar
                                      </button>
                                      <button
                                        onClick={cancelCrdEdit}
                                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="pl-16 pr-4 py-3">
                                    <span className="text-xs font-bold text-slate-600">{c.natureza || 'O'}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {c.code}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-slate-700">{c.name}</span>
                                  </td>
                                  <td className="px-4 py-3"><ValueTrace className="text-xs text-slate-700" displayValue={formatCurrency(c.saldo_anterior || 0)} source={`CRD ${c.code}`} calculation="Campo saldo_anterior do cadastro do CRD" /></td>
                                  <td className="px-4 py-3"><ValueTrace className="text-xs text-slate-700" displayValue={formatCurrency(c.previsto_mes || 0)} source={`CRD ${c.code}`} calculation="Campo previsto_mes do cadastro do CRD" /></td>
                                  <td className="px-4 py-3"><ValueTrace className="text-xs text-slate-700" displayValue={formatCurrency(c.disponivel_mes || 0)} source={`CRD ${c.code}`} calculation="Campo disponivel_mes do cadastro do CRD" /></td>
                                  <td className="px-4 py-3"><ValueTrace className="text-xs text-slate-700" displayValue={formatCurrency(c.realizado_mes || 0)} source={`CRD ${c.code}`} calculation="Campo realizado_mes do cadastro do CRD" /></td>
                                  <td className="px-4 py-3"><ValueTrace className="text-xs font-semibold text-slate-800" displayValue={formatCurrency(c.saldo || 0)} source={`CRD ${c.code}`} calculation="Campo saldo do cadastro do CRD" /></td>
                                  <td className="px-4 py-3">
                                    <span className={cn(
                                      "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                                      c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                                    )}>
                                      {c.active ? 'Ativo' : 'Inativo'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right pr-6">
                                    <button
                                      onClick={() => startEditCrd(c)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                      Editar
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ Setores / Centros de Custo + Cargos ============ */}
      {activeTab === 'setores' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-50 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Setores / Centros de Custo</h3>
                <p className="text-xs text-slate-500">
                  Cadastre e edite a estrutura organizacional usada no orçamento, funções e colaboradores.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newSectorForm.name}
                  onChange={(e) => setNewSectorForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome do setor / ccusto"
                  className="w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newSectorForm.budget_limit}
                  onChange={(e) => setNewSectorForm((p) => ({ ...p, budget_limit: e.target.value }))}
                  placeholder="Limite orçamento"
                  className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
                <button
                  type="button"
                  onClick={createSector}
                  disabled={savingSector}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors disabled:opacity-60"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar setor
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Limite de Orçamento</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Cargos</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredSectors.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400">
                        Nenhum setor cadastrado.
                      </td>
                    </tr>
                  )}
                  {filteredSectors.map((sector) => {
                    const isEditing = editingSectorId === Number(sector.id);
                    return (
                      <tr key={sector.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-3">
                          {isEditing ? (
                            <input
                              value={editSectorForm.name}
                              onChange={(e) => setEditSectorForm((p) => ({ ...p, name: e.target.value }))}
                              className="w-full max-w-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                            />
                          ) : (
                            <span className="text-sm font-medium text-slate-700">{sector.name}</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={editSectorForm.budget_limit}
                              onChange={(e) => setEditSectorForm((p) => ({ ...p, budget_limit: e.target.value }))}
                              className="w-40 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                            />
                          ) : (
                            <ValueTrace
                              className="text-sm font-bold text-slate-900"
                              displayValue={formatCurrency(sector.budget_limit)}
                              source={`Setor ${sector.name}`}
                              calculation="Campo budget_limit na tabela sectors"
                            />
                          )}
                        </td>
                        <td className="px-6 py-3 text-right text-xs text-slate-500">
                          {cargos.filter((c) => Number(c.sector_id) === Number(sector.id) && c.active).length} ativos
                        </td>
                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => saveSector(sector)}
                                disabled={savingSector}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-[#004D40] rounded-lg disabled:opacity-60"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditSector}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => startEditSector(sector)}
                                className="p-2 text-slate-400 hover:text-[#004D40] hover:bg-emerald-50 rounded-lg"
                                title="Editar setor"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteSector(sector)}
                                className="p-2 text-red-400 hover:bg-red-50 rounded-lg"
                                title="Excluir setor"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-50 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#004D40]" />
                  Funções por setor
                </h3>
                <p className="text-xs text-slate-500">
                  Cadastre as funções e vincule a um setor. Cada setor pode ter várias funções; ao escolher a função no colaborador, o setor é definido automaticamente.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newCargoForm.name}
                  onChange={(e) => setNewCargoForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome da função"
                  className="w-52 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
                <select
                  value={newCargoForm.sector_id}
                  onChange={(e) => setNewCargoForm((p) => ({ ...p, sector_id: e.target.value }))}
                  className="w-52 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">Setor / Centro de custo</option>
                  {sectors.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={createCargo}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar função
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Função</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredCargos.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400">
                        Nenhuma função cadastrada. Adicione funções e atribua a um setor acima.
                      </td>
                    </tr>
                  )}
                  {filteredCargos.map((cargo) => (
                    <tr key={cargo.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-3 text-sm font-medium text-slate-800">{cargo.name}</td>
                      <td className="px-6 py-3 text-sm text-slate-600">{cargo.sector_name || '—'}</td>
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider',
                            cargo.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          )}
                        >
                          {cargo.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => toggleCargoActive(cargo)}
                            className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                          >
                            {cargo.active ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            onClick={() => deleteCargo(cargo)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir cargo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ Colaboradores ============ */}
      {activeTab === 'colaboradores' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-50 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <UserRound className="w-4 h-4 text-[#004D40]" />
                Colaboradores
              </h3>
              <p className="text-xs text-slate-500">
                Vincule funções e o setor / centro de custo. A função principal pode sugerir o setor; você também pode cadastrar e alterar o setor diretamente.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newColaboradorForm.nome}
                onChange={(e) => setNewColaboradorForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Nome"
                className="w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <div className="w-64">
                <SearchableSelect
                  value={newColaboradorForm.funcao_id}
                  onChange={(value) => {
                    const cargo = cargos.find((c) => String(c.id) === value);
                    setNewColaboradorForm((p) => ({
                      ...p,
                      funcao_id: value,
                      sector_id:
                        cargo?.sector_id != null
                          ? String(cargo.sector_id)
                          : p.sector_id,
                    }));
                  }}
                  options={funcaoOptions}
                  placeholder="Função (opcional)"
                  emptyMessage="Cadastre funções na aba Setores"
                />
              </div>
              <div className="w-56">
                <SearchableSelect
                  value={newColaboradorForm.sector_id}
                  onChange={(value) => setNewColaboradorForm((p) => ({ ...p, sector_id: value }))}
                  options={sectorOptions}
                  placeholder="Setor / Ccusto"
                  emptyMessage="Cadastre setores na aba Setores"
                />
              </div>
              <button
                onClick={createColaborador}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[220px]">Função</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / Ccusto</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredColaboradores.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                      {query ? 'Nenhum resultado encontrado.' : 'Nenhum colaborador cadastrado.'}
                    </td>
                  </tr>
                )}
                {filteredColaboradores.map((colaborador) => {
                  const funcoes = Array.isArray(colaborador.funcoes) ? colaborador.funcoes : [];
                  const primaryId = colaborador.funcao_id != null ? String(colaborador.funcao_id) : '';
                  const sectorLabel = String(
                    colaborador.sector_name ||
                      colaborador.ccusto_descricao ||
                      funcoes.find((f: any) => f.is_primary)?.sector_name ||
                      ''
                  ).trim();
                  const matchedSector = sectors.find(
                    (s: any) =>
                      String(s.name || '').trim().toLowerCase() === sectorLabel.toLowerCase()
                  );
                  const sectorValue =
                    matchedSector != null
                      ? String(matchedSector.id)
                      : colaborador.sector_id != null
                        ? String(colaborador.sector_id)
                        : '';
                  return (
                  <tr key={colaborador.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-3 text-sm font-medium text-slate-800">{colaborador.nome}</td>
                    <td className="px-6 py-3">
                      <div className="space-y-2 min-w-[220px]">
                        <SearchableSelect
                          value={primaryId}
                          onChange={(value) => setColaboradorFuncao(colaborador, value)}
                          options={funcaoOptions}
                          placeholder="Selecionar função"
                          emptyMessage="Cadastre funções na aba Setores"
                        />
                        {funcoes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {funcoes.map((f: any) => (
                              <button
                                key={f.id}
                                type="button"
                                title={f.is_primary ? 'Função principal' : 'Clique para tornar principal · X remove'}
                                onClick={() => {
                                  if (!f.is_primary) setColaboradorFuncao(colaborador, String(f.id));
                                }}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors',
                                  f.is_primary
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                )}
                              >
                                {f.name}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="ml-0.5 text-slate-400 hover:text-red-500"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeColaboradorFuncao(colaborador, f.id, f.name);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.stopPropagation();
                                      removeColaboradorFuncao(colaborador, f.id, f.name);
                                    }
                                  }}
                                >
                                  ×
                                </span>
                              </button>
                            ))}
                            <div className="w-full max-w-[200px]">
                              <SearchableSelect
                                value=""
                                onChange={(value) => addColaboradorFuncao(colaborador, value)}
                                options={funcaoOptions.filter(
                                  (o) => !funcoes.some((f: any) => String(f.id) === o.value)
                                )}
                                placeholder="+ Outra função"
                                emptyMessage="Sem funções restantes"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 min-w-[200px]">
                      <SearchableSelect
                        value={sectorValue}
                        onChange={(value) => setColaboradorSector(colaborador, value)}
                        options={sectorOptions}
                        placeholder="Selecionar setor / ccusto"
                        emptyMessage="Cadastre setores na aba Setores"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider',
                          colaborador.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        )}
                      >
                        {colaborador.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => toggleColaboradorActive(colaborador)}
                          className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          {colaborador.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => deleteColaborador(colaborador)}
                          className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir colaborador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ Outras tabs — layout de tabela padrão ============ */}
      {activeTab !== 'crd' && activeTab !== 'setores' && activeTab !== 'colaboradores' && (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between">
          {activeTab === 'formas-pagamento' && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="key (ex: pix)"
                className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome"
                className="w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <button
                onClick={createCadastro}
                className="px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors"
              >
                Adicionar
              </button>
            </div>
          )}
          {activeTab === 'moedas' && (
            <div className="flex items-center gap-2 ml-auto">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                placeholder="código (ex: USD)"
                className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm uppercase"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome (ex: Dólar)"
                className="w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <button
                onClick={createCadastro}
                className="px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors"
              >
                Adicionar
              </button>
            </div>
          )}
          {activeTab === 'requisicoes' && (
            <div className="flex flex-wrap items-center gap-2 ml-4">
              <select
                value={reqForm.crd_id}
                onChange={(e) => setReqForm((p) => ({ ...p, crd_id: e.target.value }))}
                className="w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                <option value="">CRD</option>
                {crds.filter((c: any) => c.active !== false).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}{c.sector_name ? ` (${c.sector_name})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={reqForm.date}
                onChange={(e) => setReqForm((p) => ({ ...p, date: e.target.value }))}
                className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                type="number"
                step="0.01"
                value={reqForm.amount}
                onChange={(e) => setReqForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="Valor"
                className="w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                value={reqForm.description}
                onChange={(e) => setReqForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descrição (opcional)"
                className="w-64 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <button
                onClick={createRequisition}
                className="px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors"
              >
                Lançar requisição
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {activeTab === 'categorias' ? 'Tipo' : 'Status'}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activeTab === 'categorias' && filteredCategories.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        cat.type === 'revenue' ? "bg-emerald-500" : "bg-red-500"
                      )}></div>
                      <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                      cat.type === 'revenue' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {cat.type === 'revenue' ? 'Receita' : 'Despesa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {activeTab === 'formas-pagamento' && filteredPaymentMethods.map((pm) => (
                <tr key={pm.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-700">{pm.name}</span>
                    <span className="ml-2 text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider bg-slate-100 text-slate-500">
                      {pm.key}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                      pm.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    )}>
                      {pm.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs text-slate-400">Em breve: editar/desativar</span>
                  </td>
                </tr>
              ))}
              {activeTab === 'moedas' && filteredCurrencies.map((currency) => (
                <tr key={currency.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-700">{currency.name}</span>
                    <span className="ml-2 text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider bg-slate-100 text-slate-500">
                      {currency.key}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                      currency.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    )}>
                      {currency.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-xs text-slate-400">Em breve: editar/desativar</span>
                  </td>
                </tr>
              ))}
              {activeTab === 'requisicoes' && filteredRequisitions.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-800">
                        {(r.crd_code || 'CRD')} - {(r.crd_name || 'Sem descrição')} • {r.date}
                      </p>
                      <p className="text-xs text-slate-500">{r.sector_name || 'Sem setor'}</p>
                      <p className="text-xs text-slate-500">{r.description || '—'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <ValueTrace
                        className="text-sm font-bold text-slate-900"
                        displayValue={formatCurrency(r.amount)}
                        source={`Requisição interna #${r.id}`}
                        calculation="Campo amount da tabela requisitions"
                      />
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                        r.status === 'open' ? "bg-orange-100 text-orange-700" :
                        r.status === 'posted' ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-200 text-slate-700"
                      )}>
                        {r.status === 'open' ? 'Aberta' : r.status === 'posted' ? 'Baixada' : 'Cancelada'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {r.status === 'open' && (
                        <>
                          <button
                            onClick={() => updateReqStatus(r.id, 'posted')}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            Baixar
                          </button>
                          <button
                            onClick={() => updateReqStatus(r.id, 'cancelled')}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
