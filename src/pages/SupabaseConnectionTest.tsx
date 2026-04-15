import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleX, RefreshCw, Timer } from 'lucide-react';

type HealthResult = {
  ok: boolean;
  message: string;
  latency_ms?: number;
  sectors_count?: number;
  checked_at?: string;
  error?: string;
};

export const SupabaseConnectionTestPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/supabase/health');
      const data = (await res.json()) as HealthResult;
      setResult({
        ok: res.ok && data.ok,
        message: data.message || (res.ok ? 'Conexão OK' : 'Falha na conexão'),
        latency_ms: data.latency_ms,
        sectors_count: data.sectors_count,
        checked_at: data.checked_at,
        error: data.error,
      });
    } catch (error: any) {
      setResult({
        ok: false,
        message: 'Não foi possível consultar a API',
        error: error?.message || 'Erro de rede',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Teste de conexão Supabase</h2>
        <p className="text-slate-500 text-sm">
          Verifique se a aplicação consegue acessar o banco no Supabase.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {result?.ok ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            ) : (
              <CircleX className="w-6 h-6 text-red-500" />
            )}
            <div>
              <p className="text-sm font-bold text-slate-900">
                {result?.message || 'Aguardando teste...'}
              </p>
              {result?.checked_at && (
                <p className="text-xs text-slate-500">
                  Última checagem: {new Date(result.checked_at).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={runHealthCheck}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Testando...' : 'Testar novamente'}
          </button>
        </div>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Status</p>
              <p className={`text-sm font-bold ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
                {result.ok ? 'Conectado' : 'Erro'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Latência</p>
              <p className="text-sm font-bold text-slate-800 inline-flex items-center gap-1">
                <Timer className="w-3.5 h-3.5" />
                {typeof result.latency_ms === 'number' ? `${result.latency_ms} ms` : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Setores lidos</p>
              <p className="text-sm font-bold text-slate-800">
                {typeof result.sectors_count === 'number' ? result.sectors_count : '—'}
              </p>
            </div>
          </div>
        )}

        {!result?.ok && result?.error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Detalhe do erro</p>
            <p className="text-sm text-red-700">{result.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};
