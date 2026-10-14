import React, { useEffect, useState } from 'react';

const storageKeyFor = (userId: string | number) => `systemNameSuggestion:${userId}`;

export const SystemNamePrompt: React.FC<{ userId: string | number }> = ({ userId }) => {
  const storageKey = storageKeyFor(userId);
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === '1') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/system-name-suggestions/me');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.submitted) {
          localStorage.setItem(storageKey, '1');
          return;
        }
        setOpen(true);
      } catch {
        if (!cancelled) setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, userId]);

  useEffect(() => {
    if (!open) return;
    const blockEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', blockEscape, true);
    return () => window.removeEventListener('keydown', blockEscape, true);
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = suggestion.trim();
    if (name.length < 2) {
      setError('Informe um nome para continuar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/system-name-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Não foi possível enviar a sugestão.');
        return;
      }
      localStorage.setItem(storageKey, '1');
      setOpen(false);
    } catch {
      setError('Não foi possível enviar a sugestão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-name-title"
      >
        <div className="p-6 border-b border-slate-100">
          <h2 id="system-name-title" className="text-xl font-bold text-slate-900 leading-snug">
            Ajude a escolher um novo nome para este sistema
          </h2>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            A pedido da Sra. Luiza, gostaríamos da colaboração de todos com sugestões de nomes para o sistema atualmente nomeado &quot;Budget Controle&quot;. Lembre que precisa ter algo a ver com Financeiro e gestão estratégica.
          </p>
          <p className="text-sm font-semibold text-slate-800 mt-3 leading-relaxed">
            Você só pode enviar essa sugestão uma vez.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="system-name-suggestion" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Sugestão de nome
            </label>
            <input
              id="system-name-suggestion"
              autoFocus
              required
              maxLength={80}
              value={suggestion}
              onChange={(e) => {
                setSuggestion(e.target.value);
                if (error) setError('');
              }}
              placeholder="Escreva um nome ligado a financeiro"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => setOpen(false)}
              className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-60"
            >
              Responder depois
            </button>
            <button
              type="submit"
              disabled={saving || suggestion.trim().length < 2}
              className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] transition-colors disabled:opacity-60"
            >
              {saving ? 'Enviando...' : 'Enviar sugestão'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
