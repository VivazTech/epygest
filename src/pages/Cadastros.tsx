import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Plus,
  Search,
  Edit2,
  Trash2,
  Layers,
  Users,
  Briefcase,
  ChevronRight,
  ChevronDown,
  Upload,
  FolderOpen
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

export const CadastrosPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('categorias');
  const [categories, setCategories] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newSectorId, setNewSectorId] = useState('');
  const [editingCrdId, setEditingCrdId] = useState<number | null>(null);
  const [editCrdForm, setEditCrdForm] = useState({ code: '', name: '', sector_id: '', active: true });
  const [isImportingCrd, setIsImportingCrd] = useState(false);
  const [reqForm, setReqForm] = useState({ sector_id: '', date: '', amount: '', description: '' });
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [crdSearch, setCrdSearch] = useState('');

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
    if (!crdSearch.trim()) return crdsByGroup;
    const q = crdSearch.trim().toLowerCase();
    return crdsByGroup
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (c: any) =>
            c.name?.toLowerCase().includes(q) ||
            c.code?.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0 || g.sector.name?.toLowerCase().includes(q));
  }, [crdsByGroup, crdSearch]);

  const refreshCrds = () => fetch('/api/crds').then(res => res.json()).then(data => setCrds(data));
  const refreshSectors = () => fetch('/api/sectors').then(res => res.json()).then(data => setSectors(data));

  useEffect(() => {
    fetch('/api/categories').then(res => res.json()).then(data => setCategories(data));
    refreshSectors();
    fetch('/api/payment-methods').then(res => res.json()).then(data => setPaymentMethods(data));
    refreshCrds();
    fetch('/api/requisitions').then(res => res.json()).then(data => setRequisitions(data));
  }, []);

  const tabs = [
    { id: 'categorias', label: 'Categorias', icon: Layers },
    { id: 'setores', label: 'Setores / Centros de Custo', icon: Briefcase },
    { id: 'contas', label: 'Contas Gerenciais', icon: Database },
    { id: 'formas-pagamento', label: 'Formas de Pagamento', icon: Database },
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
    if (activeTab === 'crd') {
      if (!newSectorId) {
        alert('Selecione o setor/grupo do CRD.');
        return;
      }
      const res = await fetch('/api/crds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newKey.trim(), name: newName.trim(), sector_id: parseInt(newSectorId), active: true })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao cadastrar');
        return;
      }
      setNewKey('');
      setNewName('');
      setNewSectorId('');
      refreshCrds();
    }
  };

  const createRequisition = async () => {
    if (!reqForm.sector_id || !reqForm.date || !reqForm.amount) {
      alert('Preencha setor, data e valor.');
      return;
    }
    const res = await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sector_id: parseInt(reqForm.sector_id),
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
    setReqForm({ sector_id: '', date: '', amount: '', description: '' });
    fetch('/api/requisitions').then(res => res.json()).then(data => setRequisitions(data));
    refreshSectors();
  };

  const updateReqStatus = async (id: number, status: 'open' | 'cancelled' | 'posted') => {
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
      code: crd.code ?? '',
      name: crd.name ?? '',
      sector_id: crd.sector_id ? String(crd.sector_id) : '',
      active: crd.active !== false,
    });
  };

  const saveCrdEdit = async () => {
    if (!editingCrdId) return;
    if (!editCrdForm.code.trim() || !editCrdForm.name.trim() || !editCrdForm.sector_id) {
      alert('Preencha código, nome e grupo.');
      return;
    }

    const res = await fetch(`/api/crds/${editingCrdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: editCrdForm.code.trim(),
        name: editCrdForm.name.trim(),
        sector_id: parseInt(editCrdForm.sector_id),
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
    setEditCrdForm({ code: '', name: '', sector_id: '', active: true });
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

      <div className="flex items-center gap-2 p-1 bg-slate-100 w-fit rounded-2xl">
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
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={crdSearch}
                onChange={(e) => setCrdSearch(e.target.value)}
                placeholder="Buscar grupo ou CRD..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Código"
                className="w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome"
                className="w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
              <select
                value={newSectorId}
                onChange={(e) => setNewSectorId(e.target.value)}
                className="w-44 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                <option value="">Grupo</option>
                {sectors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
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
                {crdSearch ? 'Nenhum resultado encontrado.' : 'Nenhum CRD cadastrado.'}
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
                            <th className="pl-16 pr-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nome</th>
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
                                    <input
                                      value={editCrdForm.code}
                                      onChange={(e) => setEditCrdForm((p) => ({ ...p, code: e.target.value }))}
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                                      placeholder="Código"
                                    />
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
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
                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                      {c.code}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-slate-700">{c.name}</span>
                                  </td>
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

      {/* ============ Outras tabs — layout de tabela padrão ============ */}
      {activeTab !== 'crd' && (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          {activeTab === 'formas-pagamento' && (
            <div className="flex items-center gap-2 ml-4">
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
          {activeTab === 'requisicoes' && (
            <div className="flex flex-wrap items-center gap-2 ml-4">
              <select
                value={reqForm.sector_id}
                onChange={(e) => setReqForm((p) => ({ ...p, sector_id: e.target.value }))}
                className="w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                <option value="">Setor</option>
                {sectors.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                  {activeTab === 'categorias' ? 'Tipo' : activeTab === 'setores' ? 'Limite de Orçamento' : 'Status'}
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activeTab === 'categorias' && categories.map((cat) => (
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
              {activeTab === 'setores' && sectors.map((sector) => (
                <tr key={sector.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-700">{sector.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-900">{formatCurrency(sector.budget_limit)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {activeTab === 'formas-pagamento' && paymentMethods.map((pm) => (
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
              {activeTab === 'requisicoes' && requisitions.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-800">{r.sector_name} • {r.date}</p>
                      <p className="text-xs text-slate-500">{r.description || '—'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-900">{formatCurrency(r.amount)}</span>
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
