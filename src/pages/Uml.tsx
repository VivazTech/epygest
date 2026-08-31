import React, { useMemo, useState } from 'react';
import { Network, Workflow, Database, Boxes, GitBranch, ListTree, Search, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { Mermaid } from '../components/Mermaid';
import {
  PERMISSION_RESOURCES,
  SYSTEM_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
} from '../lib/permissionCatalog';
import {
  ARQUITETURA,
  NAVEGACAO,
  ER_ACESSO,
  ER_LANCAMENTOS,
  ER_APURACAO,
  ER_FOLHA,
  ER_PAINEIS,
  MOD_LANCAMENTOS,
  MOD_RESULTADOS,
  MOD_RECEITA_FOLHA,
  MOD_ADMIN,
  FLUXO_AUTH,
  FLUXO_IMPORT,
  FLUXO_APROVACAO,
  FLUXO_FOLHA,
  FLUXO_CMV,
  API_REFERENCE,
} from '../lib/umlDiagrams';

type SectionKey = 'arquitetura' | 'navegacao' | 'dados' | 'modulos' | 'fluxos' | 'api';

const SECTIONS: { key: SectionKey; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'arquitetura', label: 'Arquitetura', icon: Network },
  { key: 'navegacao', label: 'Navegação & Permissões', icon: ShieldCheck },
  { key: 'dados', label: 'Modelo de Dados', icon: Database },
  { key: 'modulos', label: 'Módulos & Integrações', icon: Boxes },
  { key: 'fluxos', label: 'Fluxos (Sequência)', icon: GitBranch },
  { key: 'api', label: 'Referência de API', icon: ListTree },
];

const Diagram: React.FC<{ title: string; description?: string; chart: string }> = ({ title, description, chart }) => (
  <div className="space-y-2">
    <div>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
    <Mermaid chart={chart} />
  </div>
);

export const UmlPage: React.FC = () => {
  const [section, setSection] = useState<SectionKey>('arquitetura');

  const totalRoutes = useMemo(
    () => API_REFERENCE.reduce((s, g) => s + g.routes.length, 0),
    []
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#004D40] text-white flex items-center justify-center shrink-0">
          <Workflow className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900">UML do Sistema</h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
              Somente admin
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-3xl">
            Documentação viva da arquitetura do Budget Vivaz: camadas, navegação por papel, modelo de
            dados (~60 tabelas), integração entre módulos, fluxos principais e a referência completa das
            {` ${totalRoutes} `}rotas da API. Diagramas em Mermaid — use os controles de zoom em cada um.
          </p>
        </div>
      </div>

      {/* Navegação por seção */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors',
              section === s.key
                ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            <s.icon className="w-4 h-4" />
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-8">
        {section === 'arquitetura' && (
          <>
            <Diagram
              title="Visão geral em camadas"
              description="Como o navegador (SPA), o servidor Express e o Supabase se conversam."
              chart={ARQUITETURA}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
              <InfoCard title="Cliente (SPA)">
                React 19 + Vite + Tailwind. <b>App.tsx</b> controla a aba ativa (persistida em
                localStorage) e a guarda de sessão. A <b>Sidebar</b> monta o menu conforme o papel.
              </InfoCard>
              <InfoCard title="Servidor (Express)">
                <b>src/app.ts</b> registra 180 rotas REST, protegidas por <b>requireRole</b>, com
                helmet, rate-limit e cookie httpOnly (JWT). Parsers de XLSX/BIFF e geração de PDF.
              </InfoCard>
              <InfoCard title="Supabase">
                PostgreSQL (~60 tabelas) acessado via <b>@supabase/supabase-js</b> e Storage para
                notas, boletos e imagens (URLs assinadas).
              </InfoCard>
            </div>
          </>
        )}

        {section === 'navegacao' && (
          <>
            <Diagram
              title="Login, sessão e resolução de permissão"
              description="Do login ao que cada aba consegue exibir (hasPermission → resolvePermissionResourceKey)."
              chart={NAVEGACAO}
            />
            <PermissionMatrix />
          </>
        )}

        {section === 'dados' && (
          <>
            <Diagram title="Núcleo & Acesso" chart={ER_ACESSO} />
            <Diagram title="Lançamentos & Financeiro" chart={ER_LANCAMENTOS} />
            <Diagram title="Apuração & Relatórios (competências ano/mês)" chart={ER_APURACAO} />
            <Diagram title="Apuração da Folha" chart={ER_FOLHA} />
            <Diagram title="Painéis, Sugestões & Utilidades" chart={ER_PAINEIS} />
          </>
        )}

        {section === 'modulos' && (
          <>
            <Diagram
              title="Lançamentos → Aprovações"
              description="Páginas, endpoints e tabelas de cada tipo de lançamento e como a fila de Aprovações os consome."
              chart={MOD_LANCAMENTOS}
            />
            <Diagram
              title="Apuração de Resultados (Importação → Relatórios → DRE/CMV)"
              chart={MOD_RESULTADOS}
            />
            <Diagram title="Apuração de Receita & Folha" chart={MOD_RECEITA_FOLHA} />
            <Diagram title="Administração, Cadastros, Indicadores & Painéis" chart={MOD_ADMIN} />
          </>
        )}

        {section === 'fluxos' && (
          <>
            <Diagram title="Autenticação e sessão" chart={FLUXO_AUTH} />
            <Diagram title="Importação de planilha (preview → commit)" chart={FLUXO_IMPORT} />
            <Diagram title="Aprovações" chart={FLUXO_APROVACAO} />
            <Diagram title="Apuração da Folha" chart={FLUXO_FOLHA} />
            <Diagram title="Apuração do CMV" chart={FLUXO_CMV} />
          </>
        )}

        {section === 'api' && <ApiReference total={totalRoutes} />}
      </div>
    </div>
  );
};

const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
    <p className="leading-relaxed">{children}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Matriz de permissões padrão (role × recurso)
// ---------------------------------------------------------------------------

const PermissionMatrix: React.FC = () => {
  const roles = SYSTEM_ROLES;
  const has = (roleSlug: string, key: string): boolean => {
    if (roleSlug === 'admin') return true;
    const map = DEFAULT_ROLE_PERMISSIONS[roleSlug] || {};
    return Boolean(map[key]?.includes('view'));
  };

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Matriz de acesso padrão (view)</h3>
        <p className="text-xs text-slate-500">
          Valores iniciais por papel — podem ser ajustados em Usuários › Permissões. Admin tem acesso total.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50/70 z-10">
                Recurso
              </th>
              {roles.map((r) => (
                <th key={r.slug} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {PERMISSION_RESOURCES.map((res) => (
              <tr key={res.key} className="hover:bg-slate-50/60">
                <td className="px-3 py-1.5 text-xs text-slate-700 sticky left-0 bg-white z-10">
                  {res.label}
                  <span className="text-slate-300"> · {res.group}</span>
                </td>
                {roles.map((r) => (
                  <td key={r.slug} className="px-3 py-1.5 text-center">
                    {has(r.slug, res.key) ? (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    ) : (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-200" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Referência de API (todas as rotas, com busca)
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  POST: 'bg-blue-100 text-blue-800 border-blue-200',
  PUT: 'bg-violet-100 text-violet-800 border-violet-200',
  PATCH: 'bg-amber-100 text-amber-800 border-amber-200',
  DELETE: 'bg-red-100 text-red-800 border-red-200',
};

const ApiReference: React.FC<{ total: number }> = ({ total }) => {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!query) return API_REFERENCE;
    return API_REFERENCE.map((g) => ({
      ...g,
      routes: g.routes.filter(
        (r) =>
          r.path.toLowerCase().includes(query) ||
          r.method.toLowerCase().includes(query) ||
          r.roles.toLowerCase().includes(query) ||
          g.group.toLowerCase().includes(query)
      ),
    })).filter((g) => g.routes.length > 0);
  }, [query]);

  const shown = groups.reduce((s, g) => s + g.routes.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Referência completa da API</h3>
          <p className="text-xs text-slate-500">
            {shown} de {total} rotas · roles vazio = qualquer usuário autenticado (guarda por sessão).
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por rota, método ou papel..."
            className="pl-9 pr-3 py-2 w-72 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-[#004D40]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map((g) => (
          <div key={g.group} className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">{g.group}</span>
              <span className="text-[10px] font-bold text-slate-400">{g.routes.length}</span>
            </div>
            <ul className="divide-y divide-slate-50">
              {g.routes.map((r, i) => (
                <li key={`${r.method}-${r.path}-${i}`} className="px-3 py-1.5 flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded border w-14 text-center shrink-0',
                      METHOD_COLORS[r.method] || 'bg-slate-100 text-slate-700 border-slate-200'
                    )}
                  >
                    {r.method}
                  </span>
                  <code className="text-[11px] text-slate-700 flex-1 break-all">{r.path}</code>
                  {r.roles && (
                    <span className="text-[9px] text-slate-400 font-semibold hidden sm:inline">{r.roles}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};
