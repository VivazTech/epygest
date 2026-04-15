import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Layers, 
  Users, 
  Briefcase,
  ChevronRight
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
  const [reqForm, setReqForm] = useState({ sector_id: '', date: '', amount: '', description: '' });

  useEffect(() => {
    fetch('/api/categories').then(res => res.json()).then(data => setCategories(data));
    fetch('/api/sectors').then(res => res.json()).then(data => setSectors(data));
    fetch('/api/payment-methods').then(res => res.json()).then(data => setPaymentMethods(data));
    fetch('/api/crds').then(res => res.json()).then(data => setCrds(data));
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
      const res = await fetch('/api/crds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newKey.trim(), name: newName.trim(), active: true })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Erro ao cadastrar');
        return;
      }
      setNewKey('');
      setNewName('');
      fetch('/api/crds').then(res => res.json()).then(data => setCrds(data));
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
    fetch('/api/sectors').then(res => res.json()).then(data => setSectors(data));
  };

  const updateReqStatus = async (id: number, status: 'open' | 'cancelled' | 'posted') => {
    await fetch(`/api/requisitions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetch('/api/requisitions').then(res => res.json()).then(data => setRequisitions(data));
    fetch('/api/sectors').then(res => res.json()).then(data => setSectors(data));
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
          {(activeTab === 'formas-pagamento' || activeTab === 'crd') && (
            <div className="flex items-center gap-2 ml-4">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={activeTab === 'formas-pagamento' ? 'key (ex: pix)' : 'code (ex: CRD1)'}
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
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
              {activeTab === 'crd' && crds.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-700">{c.name}</span>
                    <span className="ml-2 text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider bg-slate-100 text-slate-500">
                      {c.code}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                      c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                    )}>
                      {c.active ? 'Ativo' : 'Inativo'}
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
    </div>
  );
};
