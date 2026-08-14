import React, { useMemo } from 'react';
import { BookOpen, Compass, Play } from 'lucide-react';
import { useTutorial } from '../context/TutorialContext';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

export const TutorialPage: React.FC = () => {
  const { groups, startOverview, startGroup, startItem } = useTutorial();
  const { query } = useSearch();

  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            matchesSearch(query, group.title, group.blurb, item.label, item.summary)
          ),
        }))
        .filter((group) => group.items.length > 0),
    [groups, query]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="rounded-3xl border border-emerald-900/10 bg-[#004D40] text-white overflow-hidden shadow-sm">
        <div className="px-6 py-7 sm:px-8 sm:py-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-200/80">
              Ajuda · Budget Vivaz
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Tutorial guiado</h2>
            <p className="mt-3 text-sm text-emerald-50/85 leading-relaxed">
              Mapa do menu lateral, organizado como você vê à esquerda. Leia para que serve cada aba
              e inicie um tour que destaca o item no menu e abre a tela.
            </p>
          </div>
          <button
            type="button"
            onClick={startOverview}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#c5a35a] text-[#1c2b24] text-sm font-bold hover:bg-[#d4b56a] transition-colors shrink-0"
          >
            <Play className="w-4 h-4" />
            Iniciar tutorial guiado
          </button>
        </div>
      </div>

      <div data-tour="tutorial-map" className="space-y-6">
        {visibleGroups.map((group) => (
          <section
            key={group.id}
            data-tour={`group-card-${group.id}`}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-800" />
                  <h3 className="text-sm font-bold text-slate-900">{group.title}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-3xl">{group.blurb}</p>
              </div>
              <button
                type="button"
                onClick={() => startGroup(group.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 transition-colors shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                Iniciar nesta seção
              </button>
            </div>

            <ul className="divide-y divide-slate-100">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startItem(item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors shrink-0 self-start sm:self-center"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Ver esta aba
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {visibleGroups.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-12 text-center text-sm text-slate-400">
            Nenhuma aba encontrada para essa busca.
          </div>
        )}
      </div>
    </div>
  );
};
