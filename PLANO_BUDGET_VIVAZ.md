# Plano de Execução — Budget Vivaz

Plano técnico detalhado por fase, derivado do documento de projeto "Sistema de Orçamento Vivaz" (reunião 01/08).
Aterrado na stack atual: **React 19 + Vite + Express (`src/app.ts`) + Supabase (Postgres)**.

## Convenções técnicas (todo módulo novo segue este padrão)
1. **Banco:** criar `sql/NN_nome.sql` (migração numerada) e aplicar no Supabase (via SQL Editor ou MCP). Tabelas em `public.`, com `created_at`/`updated_at` + trigger, e `UNIQUE` na chave natural.
2. **Backend:** adicionar rotas `/api/...` em `src/app.ts` usando o client `supabase` e `requireRole(...)` para escrita.
3. **Frontend:** criar `src/pages/Nome.tsx`, registrar no `switch` de `src/App.tsx` e no menu (`src/components/Sidebar.tsx`). Páginas largas entram na lista `w-full max-w-none` de `App.tsx`.
4. **Traços de valor:** usar `ValueTrace` + `valueTraceMeta.ts` quando o número precisa explicar sua origem (padrão do DRE/PrevReal).

## Legenda de status
✅ pronto · 🟡 parcial · ❌ a fazer

---

# Registro de entregas recentes (fora / transversal às fases)

> Itens feitos no sistema que sustentam o Resumo Executivo, DRE, cadastros e a Fase 4.

### Resumo Executivo (Dashboard) 🟡 → avançado
- Cards **Receita Hospedagem / A&B / Eventos / Outras Receitas** somam linhas específicas do **RDS** (`rds_snapshots`, coluna Acumulado R$) — **não** usam o Total da seção.
- Hover (`ValueTrace`) lista **cada linha somada com valor** + total (`rdsDetalhes` em `GET /api/dashboard/indicators`).
- Mapeamento em `src/app.ts` (`DASHBOARD_RDS_GROUPS`).
- Correção de crash tela branca: referência órfã `rdsTrace` em [Dashboard.tsx](src/pages/Dashboard.tsx) → `buildRdsCardTrace`.
- Perfil **Diretoria** não usa esse resumo RDS: abre o consolidado 4.9 ([DashboardDiretoria.tsx](src/pages/DashboardDiretoria.tsx) via [App.tsx](src/App.tsx)).

### DRE Gerencial — Realizado via RDS + rollups ✅/🟡
- Realizado alimentado pelo RDS (`DRE_RDS_MAPPINGS` + `GET /api/dre/realizado-rds`).
- **Rollup de pais:** Realizado (e Diferença) sobe na árvore:
  - Receita de Diárias ← Diária + Café + MAP/FAP  
  - Receita A&B ← filhos A&B  
  - Outras Receitas ← filhos  
  - **(+ ) RECEITA BRUTA** ← Diárias + A&B + Outras  
- Prioridade: edição manual > rollup/RDS > planilha. Células RDS com fundo azul claro.
- Filtro de meses (multi-seleção / acumulado) e destaque de estouro já aplicados.

### Prev × Real Mensal — filtro de meses ✅
- Mesmo padrão visual do DRE: Filtrar meses · clique isola · “Mostrar todos”.
- Colunas e totais (linha / grupo / geral) consideram só meses visíveis. [PrevReal.tsx](src/pages/PrevReal.tsx).

### Cadastros — funções ↔ setores ↔ colaboradores ✅
- Funções = tabela `cargos` (N funções por setor via `sector_id`).
- N:N colaboradores ↔ funções: `colaborador_funcoes` ([sql/20_colaborador_funcoes.sql](sql/20_colaborador_funcoes.sql), aplicada no Supabase).
- Na tabela de colaboradores: `SearchableSelect` de função → define automaticamente o **setor/ccusto** da função; suporte a várias funções (principal + chips).

### Lançamentos — DANFE e Mensalidades ✅
- **DANFE:** [Invoices.tsx](src/pages/Invoices.tsx) com `mode="danfe"` — título/navegação “DANFE” (separado de Notas de Serviço).
- **Mensalidades:** Lançamentos → Mensalidades (`mensalidades`) — contratos/mensalidades (ver 4.8). *Antes estava sob Compras; movido para Lançamentos.*

### Perfil Diretoria + Investimentos ✅
- Role `diretoria` ([sql/24_role_diretoria.sql](sql/24_role_diretoria.sql)): login abre dashboard consolidado; menu com Dashboard, DRE, Indicadores, Setores, Mensalidades, Investimentos.
- Sessão **Investimentos** (4.7): previsto / lançado / realizado / saldo / % / estouro.
- Dashboard Diretoria (4.9): KPIs Indicadores, alertas de contratos **e** investimentos, uso/consumo, atalhos setoriais.

### Supabase
- Projeto conectado: **Epyguest** (`tgghyxgbculkolhyscmm`, org EpyGest Vivaz Cataratas).
- `rds_snapshots` ativa (competências 2026 importadas).
- Migrations aplicadas nesta entrega da Fase 4:
  - [sql/22_paineis_setoriais.sql](sql/22_paineis_setoriais.sql)
  - [sql/23_contratos.sql](sql/23_contratos.sql)
  - [sql/24_role_diretoria.sql](sql/24_role_diretoria.sql)
  - [sql/25_investimentos.sql](sql/25_investimentos.sql)

---

# FASE 1 — Correções e base de dados
> Alicerce: sem o realizado por setor e os números de 2019 corretos, nenhum painel fecha.

## 1.1 Importar o **Realizado por setor** (planilha "Dados Vivaz") ❌
**Objetivo:** trazer o realizado mensal por setor/linha orçamentária para dentro do sistema, ao lado do previsto (que já existe em `crd_monthly_values`).

**Estado atual:** o previsto está importado; `crd_realizado` tem poucos registros (incompleto). Os painéis setoriais (Fase 4) já leem `crd_realizado` quando houver dados.

**Dependência:** nova cópia da planilha "Dados Vivaz" (Cris).

**Tarefas**
- **Mapeamento:** ao receber a planilha, mapear abas/colunas → (setor/CRD, ano, mês, valor realizado). Documentar o mapa (como foi feito em `importacao/DOCUMENTACAO_FORMULAS.md`).
- **Banco:** consolidar em `crd_realizado` (ou `crd_monthly_values` com uma coluna/tabela paralela de realizado). Definir chave `(crd_id, year, month)` única. Avaliar reuso do modelo de `crd_monthly_values`.
- **Script de importação:** `scripts/import_realizado_setor.py` (espelhar `scripts/import_indicadores.py`): lê o xlsx, extrai por (setor, mês), gera seed SQL idempotente (`ON CONFLICT ... DO UPDATE`).
- **Backend:** garantir que `/api/prev-real` e a apuração leiam esse realizado por setor.
- **Validação:** conferir totais por setor contra a planilha (script de reconciliação que soma e compara).
- **Rotina de atualização:** documentar o passo-a-passo de reimportação para as próximas cópias.

**Critério de conclusão:** apuração por setor mostra previsto, realizado, diferença e % por mês, com totais batendo com a planilha original.

## 1.2 Correções de dados históricos — 2019 ❌
**Objetivo:** eliminar as divergências apontadas.

**Problemas do documento**
- Faturamento realizado 2019: **Sistema R$ 5.032.280 × Budget R$ 5.013.932** (diferença ~R$ 18.348).
- **Maio/2019:** bug nos lançamentos, resultado ≈ **−R$ 187.033**.
- **Outras Receitas 2019:** Budget R$ 442,59 × Planilha R$ 460,57.

**Tarefas**
- Auditar o faturamento 2019: comparar sistema × budget × planilha base, isolar em qual linha/mês nasce a diferença de ~18k (query por mês/CRD).
- Revisar todos os lançamentos de **maio/2019**; identificar a causa (duplicidade? sinal trocado? importação parcial?), corrigir e revalidar o resultado do mês.
- Corrigir "Outras Receitas" 2019 (ajustar valor para bater com a planilha validada).
- **Documentar a causa** de cada divergência (evitar reincidência).

**Critério de conclusão:** maio/2019 corrigido; faturamento anual e Outras Receitas de 2019 iguais à base validada; sistema e planilha com os mesmos números finais.

## 1.3 Validar totais anuais ❌
- Rotina/consulta de reconciliação por ano (2018–2026): soma sistema × soma planilha, por setor e consolidado.
- Registrar as conferências (planilha ou tela) para auditoria (Elton = receitas, Cris = despesas).

---

# FASE 2 — Apuração e comparativos

## 2.1 Filtro de **período acumulado** (multi-mês) ✅ (DRE + Indicadores + Prev Real Mensal)
**Feito:**
- **DRE / Indicadores:** multi-seleção com acumulado; Shift+clique para faixa; “Mostrar todos”.
- **Prev × Real Mensal:** filtro de meses no mesmo padrão visual (isola mês / mostrar todos); totais recalculados só com meses visíveis — [PrevReal.tsx](src/pages/PrevReal.tsx).

**Pendente:** no Prev Real, evoluir para multi-seleção com acumulado estilo Shift+faixa (hoje o clique isola um mês, como no DRE “modo simples”).

## 2.2 Destaque de **estouro** em vermelho ✅ (DRE + Indicadores + painéis setoriais)
**Feito:** DRE e Indicadores com favorabilidade na Diferença e fundo vermelho em despesa estourada. Painéis setoriais (Fase 4) também destacam estouro (realizado > previsto) nas tabelas e no relatório semanal da Controladoria. Investimentos destacam estouro (lançado/realizado > previsto).
**Pendente:** replicar destaque no PrevReal por setor (depende da natureza por CRD).

## 2.3 Revisar a linha/coluna de **"Ajustes"** 🟡
**Estado atual:** existe `orcamento_ajustes` e a página [AjustesLive]/[OrcamentoLive].

**Tarefas**
- Entender o que a linha de ajustes representa (é base do orçamento? correção?).
- Padronizar nomenclatura e a **regra de cálculo** (documentar).
- Garantir consistência entre ajustes e o previsto/realizado exibido.

## 2.4 Comparativo **ano a ano** (2024 / 2025 / 2026) ✅ (estrutura, sobre Indicadores)
**Feito:** nova aba **"Comparativo Anual"** no painel de Indicadores. Backend `GET /api/indicadores/comparativo?anos=2024,2025,2026` retorna o total anual (realizado e meta) de cada ano com o mesmo cálculo do painel. A tela mostra os indicadores × anos selecionados (chips) com **variação %** entre cada ano e o anterior, e alternância **Realizado/Meta**. A regra "2018 sem metas / 2019+ com metas" é sinalizada (ver 3.1). Ver `renderComparativoAnual` em [Indicadores.tsx](src/pages/Indicadores.tsx).
**Pendente:** comparativo ano a ano **por linha do DRE/CRD** (este cobre os indicadores gerenciais); padronizar percentuais nas abas anuais do orçamento por setor (depende da Fase 1.1).

---

# FASE 3 — Indicadores principais

## 3.1 Finalizar o Painel de Indicadores (histórico desde 2018) ✅
**Feito:** módulo [Indicadores](src/pages/Indicadores.tsx) com Realizado 2018–2025 e Metas 2019–2026; EBITDA, **Margem EBITDA %**, Faturamento, Resultado Líquido, layout DRE + filtro de meses. Cálculo validado ao centavo. Nesta etapa:
- ✅ Novo indicador **"Resultado Líquido ÷ Faturamento (%)"** (`rl_sobre_faturamento`, calculado no backend `computeIndicadores` e recalculado no agregado do frontend).
- ✅ **Sinalização "sem meta"**: quando o ano não tem metas (ex.: 2018), as colunas Previsto/Diferença aparecem como “—” e um aviso é exibido no rodapé da tabela.

**Pendente (menor):** deixar explícito no traço de valor (ValueTrace) que **EBITDA = Faturamento − Despesas Operacionais** — hoje a composição está documentada mas sem tooltip dedicado.

**Critério:** painel mostra valor **e** percentual, cobertura desde 2018. ✅

## 3.2 Validar fórmulas e bases ✅/🟡
- Já validado para os indicadores atuais. Revalidar após entrar o realizado por setor (Fase 1) para garantir coerência entre o DRE por setor e os indicadores gerenciais.

---

# FASE 4 — Painéis setoriais
> Padrão comum a todos: cada painel é uma página + rotas `/api/paineis/:key`; reutilizam orçado/realizado (Fase 1) e indicadores. Sempre com **previsto × realizado**, **%** e destaque de estouro.

### Entrega 4.1–4.9 ✅ (estrutura completa da Fase 4)
| Item | Detalhe |
|---|---|
| Menu Setores | Grupo **Setores** no [Sidebar.tsx](src/components/Sidebar.tsx) com 6 subsessões (4.1–4.6) |
| Menu Lançamentos | **Mensalidades** (`mensalidades`) — contratos (4.8) |
| Menu próprio | **Investimentos** (`investimentos`) — 4.7 |
| Perfil | Role **`diretoria`** — dashboard consolidado (4.9) |
| Frontend | [PainelSetorial.tsx](src/pages/PainelSetorial.tsx) + [paineisSetoriais.ts](src/lib/paineisSetoriais.ts); [Mensalidades.tsx](src/pages/Mensalidades.tsx); [Investimentos.tsx](src/pages/Investimentos.tsx); [DashboardDiretoria.tsx](src/pages/DashboardDiretoria.tsx) |
| Backend | `/api/paineis/*`, `/api/contratos`, `/api/investimentos`, `/api/dashboard/diretoria` (`src/app.ts`) |
| Banco | sql/22…25 aplicados no Supabase (painéis, contratos, role diretoria, investimentos) |
| Dados painéis | Previsto ← `crd_monthly_values`; Realizado ← `crd_realizado` (**volume completo depende da Fase 1.1**) |

## 4.1 Painel Gerência Operacional ✅
- Blocos Manutenção / Gás / Energia (match por CRD), KPIs do período, ocupação (Síntase), custo energia/RN, filtro de meses, observações do gestor por (painel, ano, mês).

## 4.2 Painel A&B ✅
- Quebras (louças/utensílios), sobras (café), mini-DREs Pizzaria / Frigobar / Café, previsto×realizado do setor A&B, observações.

## 4.3 Painel SPA ✅
- CRDs com “SPA”, receita/custos e **% resultado sobre receita**, previsto×realizado, observações.

## 4.4 Painel Hospedagem ✅
- Blocos receita / lavanderia / outros do setor Hospedagem, card lavanderia, previsto×realizado, observações.

## 4.5 Painel Nutricionista ✅ (estrutura)
- CRUD de ações: responsável, prazo, status, custo previsto/realizado, observações. Conteúdo de despesas ainda a definir com a Cris/equipe.

## 4.6 Painel Controladoria (relatório semanal) ✅
- Lançamentos semanais de uso/consumo (previsto, realizado, setor responsável, estouro em vermelho), contador de estouros, observações do mês.
- **Pendente menor:** rotina formal de importação/conferência automática a partir do Consumo Interno (hoje o lançamento semanal é manual na tela).

## 4.7 Painel de Investimentos ✅
- **Menu:** sessão **Investimentos** (`investimentos`) — item próprio na sidebar.
- **Banco:** tabela `investimentos` ([sql/25_investimentos.sql](sql/25_investimentos.sql), aplicada no Supabase) — nome, valor previsto/lançado/realizado, status, setor, CRD, responsável, observações.
- **Cálculos (API):** saldo a realizar = previsto − realizado; % executado = realizado ÷ previsto; flag de estouro se lançado ou realizado > previsto.
- **API:** `GET/POST /api/investimentos`, `PATCH/DELETE /api/investimentos/:id`.
- **UI:** [Investimentos.tsx](src/pages/Investimentos.tsx) — CRUD, filtros, KPIs e destaque de estouros.
- **Diretoria:** alertas de estouro no dashboard consolidado + atalho.
- **Critério:** execução dos investimentos acompanhada; diferença previsto/lançado/realizado clara.

## 4.8 Painel de Contratos e Mensalidades ✅
- **Menu:** Lançamentos → **Mensalidades** (`mensalidades`).
- **Banco:** tabela `contratos` ([sql/23_contratos.sql](sql/23_contratos.sql), aplicada no Supabase) — fornecedor, valor, status, ativo, assinado, setor, CRD, vencimento, periodicidade, responsável, observações.
- **API:** `GET/POST /api/contratos`, `PATCH/DELETE /api/contratos/:id`.
- **UI:** [Mensalidades.tsx](src/pages/Mensalidades.tsx) — lançamento manual, filtros por status/setor, alertas de vencimento (30 dias), separação ativos/vencidos/pendentes de assinatura/encerrados, KPIs.
- **Critério:** financeiro lança e acompanha; vencimentos e alertas visíveis.

## 4.9 Dashboard da Diretoria (consolidado) ✅
- **Perfil:** role `diretoria` ([sql/24_role_diretoria.sql](sql/24_role_diretoria.sql)) — no login / restauração de sessão abre o **Dashboard consolidado**.
- **API:** `GET /api/dashboard/diretoria?month=&year=` — KPIs de Indicadores (faturamento, EBITDA, margem, RL e %), previsto×realizado, comparativos mensal/acumulado/ano a ano, indicadores por setor (YTD), alertas de **contratos** e **investimentos**, resumo de uso e consumo, principais estouros, atalhos.
- **UI:** [DashboardDiretoria.tsx](src/pages/DashboardDiretoria.tsx) — renderizado em [App.tsx](src/App.tsx) quando `user.role === 'diretoria'` (aba `dashboard`).
- **Menu (leitura):** Dashboard, DRE, Indicadores, Setores (painéis), Lançamentos → Mensalidades, Investimentos.
- **Critério:** diretoria tem visão geral em uma tela, com números consolidados e alertas; detalhe continua nos painéis setoriais / sessões específicas.

---

# FASE 5 — Novo Orçamento Aquamania ❌
**Objetivo:** criar, a partir da base do Vivaz, o orçamento completo do Aquamania.

**Tarefas**
- Estruturar isolamento por **unidade/empresa** (ex.: coluna `unidade` nas tabelas de orçamento, ou schema/base separada) para não misturar Vivaz × Aquamania.
- Adaptar a estrutura (setores/CRDs) para o Aquamania.
- Preparar importações: **folha de pagamento**, **mensalidades**, **projeção de impostos**, **uso e consumo**, **metas de venda**.
- Entender a **metodologia de projeção de impostos** da planilha do Rodrigo antes de importar.
- Painéis e relatórios de acompanhamento do Aquamania (reuso dos componentes do Vivaz).

**Dependências:** impostos (Rodrigo), uso e consumo (Elton), metas de venda (Bibliana).

**Critério:** budget do Aquamania criado a partir da base do Vivaz, dados principais importados, estrutura pronta para acompanhamento.

---

# Dependências externas (bloqueiam parte das fases)
| Insumo | Responsável | Bloqueia |
|---|---|---|
| Nova cópia da planilha "Dados Vivaz" | Cristiane | Fase 1.1, e por consequência volume nos painéis |
| Metodologia de projeção de impostos | Rodrigo | Fase 5 |
| Orçamento de uso e consumo | Elton | Integração automática 4.6, Fase 5 |
| Metas de venda | Bibliana | Fase 5 |
| Definição de despesas/ações da Nutricionista | Cris/equipe | Expansão do 4.5 |
| Auditoria de receitas / despesas importadas | Elton / Cristiane | Fase 1.2, validações |

# Checklist final de validação (do documento)
- [x] Previsto × realizado por mês (DRE / Indicadores / Prev Real / painéis — volume depende da Fase 1.1)
- [x] Previsto × realizado acumulado (filtro de meses DRE / Indicadores / Prev Real Mensal)
- [x] Linhas estouradas em vermelho (DRE / Indicadores / painéis setoriais / investimentos / controladoria)
- [ ] Todos os painéis com percentuais (parcial: SPA, KPIs e investimentos; falta padronizar 100% nos demais)
- [x] Comparativo ano a ano (Indicadores)
- [ ] Dados de 2019 corrigidos
- [x] Painel histórico com EBITDA e resultado líquido em %
- [x] Painéis setoriais criados (4.1–4.6: menu **Setores**)
- [x] Contratos/mensalidades por setor e CRD (Lançamentos → Mensalidades)
- [x] Controladoria: uso e consumo semanal (tela + CRUD; importação automática pendente)
- [x] Dashboard da Diretoria consolidado (role `diretoria`)
- [x] Investimentos: previsto/lançado/realizado/saldo (menu **Investimentos**)
- [ ] Aquamania com budget próprio
