import React, { useEffect, useState } from 'react';
import { Plus, Archive, XCircle } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';

export const RequisicoesPage: React.FC = () => {
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [form, setForm] = useState({
    sector_id: '',
    date: '',
    amount: '',
    description: ''
  });

  const loadData = () => {
    fetch('/api/requisitions').then((res) => res.json()).then(setRequisitions);
    fetch('/api/sectors').then((res) => res.json()).then(setSectors);
  };

  useEffect(() => {
    loadData();
  }, []);

  const createRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sector_id || !form.date || !form.amount) {
      alert('Preencha setor, data e valor.');
      return;
    }

    const res = await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sector_id: parseInt(form.sector_id),
        date: form.date,
        amount: parseFloat(form.amount),
        description: form.description || null
      })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Não foi possível lançar a requisição.');
      return;
    }

    setForm({ sector_id: '', date: '', amount: '', description: '' });
    loadData();
  };

  const updateStatus = async (id: number, status: 'posted' | 'cancelled') => {
    await fetch(`/api/requisitions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadData();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Requisições Internas</h2>
        <p className="text-slate-500 text-sm">
          Registre compras internas do almoxarifado para compor o orçamento do setor.
        </p>
      </div>

      <form onSubmit={createRequisition} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select
          required
          value={form.sector_id}
          onChange={(e) => setForm((p) => ({ ...p, sector_id: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          <option value="">Setor</option>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <input
          required
          type="date"
          value={form.date}
          onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />

        <input
          required
          type="number"
          step="0.01"
          placeholder="Valor"
          value={form.amount}
          onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />

        <input
          placeholder="Descrição (opcional)"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />

        <button
          type="submit"
          className="flex items-center justify-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="font-bold text-sm">Lançar requisição</span>
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {requisitions.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-slate-700">{r.sector_name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{r.date}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{r.description || '—'}</td>
                <td className="px-6 py-4">
                  <ValueTrace
                    className="text-sm font-bold text-slate-900"
                    displayValue={formatCurrency(r.amount)}
                    source={`Requisição interna #${r.id}`}
                    calculation="Campo amount informado no lançamento da requisição"
                  />
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                    r.status === 'open' ? "bg-orange-100 text-orange-700" :
                    r.status === 'posted' ? "bg-emerald-100 text-emerald-700" :
                    "bg-slate-200 text-slate-700"
                  )}>
                    {r.status === 'open' ? 'Aberta' : r.status === 'posted' ? 'Baixada' : 'Cancelada'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    {r.status === 'open' && (
                      <>
                        <button
                          onClick={() => updateStatus(r.id, 'posted')}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Baixar requisição"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateStatus(r.id, 'cancelled')}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar requisição"
                        >
                          <XCircle className="w-4 h-4" />
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
  );
};

