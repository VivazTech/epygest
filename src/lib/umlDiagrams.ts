// Definições dos diagramas (Mermaid) do UML completo do sistema Budget Vivaz.
// Mantido separado da página para facilitar a leitura/edição.

export const ARQUITETURA = `
flowchart TB
  subgraph Cliente["Navegador — SPA React 19 + Vite + Tailwind"]
    APP["App.tsx<br/>roteamento por aba + guarda de sessão"]
    SB["Sidebar<br/>menu montado por papel/permissão"]
    PAGES["~30 páginas (pages/*.tsx)"]
    CTX["Contexts<br/>Search • Toast • Tutorial"]
    LIBS["libs<br/>permissionCatalog • planilhas • cmv • utils"]
    APP --> SB
    APP --> PAGES
    APP --> CTX
    PAGES --> LIBS
  end

  subgraph Servidor["Node — Express (server.ts / src/app.ts)"]
    MW["Middlewares<br/>helmet • cookie-parser • rate-limit • requireRole"]
    API["API REST — 180 rotas /api/*"]
    PARSE["Serviços<br/>XLSX/BIFF • pdf-parse • PDFKit • JWT • bcrypt"]
    MW --> API
    API --> PARSE
  end

  subgraph Supabase["Supabase (nuvem)"]
    PG[("PostgreSQL<br/>~60 tabelas")]
    ST[("Storage<br/>notas • boletos • imagens")]
  end

  GENAI["Google GenAI<br/>extração de NF/boleto"]

  PAGES -->|"fetch JSON + cookie httpOnly"| MW
  API -->|"@supabase/supabase-js"| PG
  API -->|"upload / signed URL"| ST
  PARSE -.->|"OCR / extração"| GENAI
`;

export const NAVEGACAO = `
flowchart TB
  L["Login (email+senha)"] --> AUTH["POST /api/auth/login<br/>bcrypt + emite JWT"]
  AUTH --> COOKIE["cookie httpOnly (JWT)"]
  COOKIE --> ME["GET /api/auth/me"]
  ME --> USER["user { id, role, permissions[] }"]
  USER --> SIDEBAR["Sidebar monta grupos visíveis"]
  USER --> GUARD["App.canAccessTab(tab)"]

  GUARD --> HP["hasPermission(perms, tab, 'view', role)"]
  HP --> RES["resolvePermissionResourceKey(tab)<br/>ex.: cmv-3 → apuracao-resultados"]
  RES --> ROW["role_permissions.can_view ?"]
  ROW -->|sim| SHOW["renderContent()"]
  ROW -->|não| FALL["fallback: Dashboard"]
  R2["role = admin"] -->|atalho: acesso total| SHOW

  SIDEBAR --> G1["Em construção • Lançamentos • Aprovações • Compras"]
  SIDEBAR --> G2["Base de Orçamento • Apuração de Resultados"]
  SIDEBAR --> G3["Apuração de Receita • Apuração da Folha"]
  SIDEBAR --> G4["Admin: Usuários • Sugestões • Configurações • UML"]
`;

export const ER_ACESSO = `
erDiagram
  users ||--o{ user_sectors : "atua em"
  sectors ||--o{ user_sectors : "recebe"
  app_roles ||--o{ role_permissions : "define"
  users }o--|| app_roles : "papel"
  colaboradores ||--o{ colaborador_funcoes : "exerce"
  cargos ||--o{ colaborador_funcoes : "classifica"
  users {
    uuid id
    text name
    text email
    text role
  }
  app_roles {
    text slug
    text label
  }
  role_permissions {
    text role_slug
    text resource_key
    bool can_view
    bool can_create
    bool can_edit
    bool can_delete
  }
  sectors { int id  text nome }
  cargos { int id  text nome }
  colaboradores { int id  text nome }
  pdv_locais { int id  text nome }
  categories { int id  text nome }
  currencies { text code }
  payment_methods { int id  text nome }
`;

export const ER_LANCAMENTOS = `
erDiagram
  sectors ||--o{ requisitions : "origem"
  crds ||--o{ requisitions : "conta"
  sectors ||--o{ invoices : "setor"
  crds ||--o{ invoices : "conta"
  sectors ||--o{ manual_entries : "setor"
  crds ||--o{ manual_entries : "conta"
  comandas ||--o{ comanda_items : "contém"
  contratos ||--o{ contrato_lancamentos : "gera"
  requisitions {
    int id
    text status
    numeric valor
    text destino
  }
  invoices {
    int id
    text tipo
    numeric valor
    text flow_status
  }
  manual_entries {
    int id
    numeric valor
    text status
  }
  comandas { int id  text status }
  comanda_items { int id  numeric valor }
  contratos { int id  text fornecedor }
  contrato_lancamentos { int id  text status }
  investimentos { int id  numeric valor }
  financial_records { int id  numeric valor }
`;

export const ER_APURACAO = `
erDiagram
  rds_snapshots {
    int year
    int month
    jsonb sections
  }
  requisicoes_rows {
    int year
    int month
    int setor_codigo
    text destino
    numeric valor
  }
  consumo_interno_rows {
    int year
    int month
    numeric vl_liquido
  }
  rel_crd_rows {
    int year
    int month
    numeric valor
  }
  cmv_apuracao {
    int year
    int month
    numeric requisicoes_total
    numeric limite_pct
  }
  crd_monthly_values { int year  int month  numeric valor }
  crd_realizado { int year  int month  numeric valor }
  indicadores_mensais { int year  int month  numeric valor }
  indicadores_parametros { text chave  numeric valor }
  dre_cell_edits { int year  int month  text field }
  dre_cell_edit_history { int id  text motivo }
  orcamento_ajustes { int year  text cell }
  sintase_occupancy { int year  int month }
  scenarios { int id  text nome }
  dre_cell_edits ||--o{ dre_cell_edit_history : "audita"
`;

export const ER_FOLHA = `
erDiagram
  folha_importacoes ||--o{ folha_lancamentos_importados : "traz"
  folha_importacoes ||--o{ folha_lancamentos : "consolida"
  folha_funcionarios ||--o{ folha_lancamentos : "recebe"
  folha_rubricas ||--o{ folha_rubricas_parametros : "parametriza"
  folha_apuracoes_mensais ||--o{ folha_apuracao_auditoria : "registra"
  folha_setores ||--o{ folha_cargos : "agrupa"
  folha_importacoes { int id  int year  int month }
  folha_lancamentos { int id  numeric valor }
  folha_lancamentos_importados { int id  numeric valor }
  folha_funcionarios { int id  text nome }
  folha_rubricas { text codigo  text descricao }
  folha_rubricas_parametros { text codigo  text tipo }
  folha_rubricas_ignoradas { text codigo }
  folha_parametros_encargos { text chave  numeric valor }
  folha_apuracoes_mensais { int year  int month  text status }
  folha_apuracao_auditoria { int id  text acao }
  folha_config { text chave  text valor }
  folha_custo_manual { int id  numeric valor }
  folha_setores { int id  text nome }
  folha_cargos { int id  text nome }
  folha_situacoes_resumo { int year  int month }
  folha_pagamento { int id  numeric valor }
`;

export const ER_PAINEIS = `
erDiagram
  painel_observacoes { text key  text texto }
  painel_ab_quebras { int id  numeric valor }
  painel_ab_sobras { int id  numeric valor }
  painel_nutri_acoes { int id  text acao }
  painel_controladoria_semanal { int id  text item }
  user_suggestions { int id  text texto  bool done }
  import_history { int id  text tipo  jsonb payload }
  uso_consumo_subgrupos { int codigo  text nome }
`;

export const MOD_LANCAMENTOS = `
flowchart LR
  subgraph UI["Páginas — Lançamentos"]
    P1["Comandas"]
    P2["Requisicoes"]
    P3["Invoices (Notas/DANFE)"]
    P4["LancamentosManuais"]
    P5["Mensalidades"]
    P6["Aprovacoes"]
  end
  subgraph EP["Endpoints"]
    E1["/api/comandas (+status)"]
    E2["/api/requisitions (+status)"]
    E3["/api/invoices (extract, receipt, boleto, flow)"]
    E4["/api/manual-entries (+file, +status)"]
    E5["/api/contratos • /api/contrato-lancamentos"]
    E6["/api/aprovacoes"]
  end
  subgraph DB["Tabelas"]
    T1[("comandas / comanda_items")]
    T2[("requisitions")]
    T3[("invoices")]
    T4[("manual_entries")]
    T5[("contratos / contrato_lancamentos")]
  end
  P1-->E1-->T1
  P2-->E2-->T2
  P3-->E3-->T3
  P4-->E4-->T4
  P5-->E5-->T5
  E3 -.->|Google GenAI| G["extração de NF"]
  P6-->E6
  E6 -.->|lê pendências| T2 & T3 & T4 & T5 & T1
`;

export const MOD_RESULTADOS = `
flowchart LR
  subgraph IMP["Importação (XLSX Desbravador)"]
    I1["/api/import/rel-crd"]
    I2["/api/import/requisicoes-sintetica"]
    I3["/api/import/consumo-interno"]
    I4["/api/import/rds"]
  end
  subgraph TB["Tabelas de competência (ano/mês)"]
    R1[("rel_crd_rows")]
    R2[("requisicoes_rows")]
    R3[("consumo_interno_rows")]
    R4[("rds_snapshots")]
    R5[("cmv_apuracao")]
    R6[("dre_cell_edits")]
  end
  subgraph UI["Apuração de Resultados"]
    U1["RelatorioCrd"]
    U2["RelatorioRequisicoes"]
    U3["ConsumoInterno"]
    U4["CMV (Resumo + meses)"]
    U5["DRE Gerencial"]
    U6["Planilhas / Prev x Real"]
  end
  I1-->R1-->U1
  I2-->R2-->U2
  I3-->R3-->U3
  I4-->R4
  U4-->|"POST /api/cmv"|R5-->U4
  R4-->U5
  R1-->U5
  R6-->U5
  U5-->|"PATCH /api/dre/cell"|R6
`;

export const MOD_RECEITA_FOLHA = `
flowchart LR
  subgraph Receita["Apuração de Receita"]
    RR["RelatorioRds"] --> ERR["/api/rds (+competencias)"] --> TRR[("rds_snapshots")]
    SI["Sintase"] --> ESI["/api/sintase (+occupancy)"] --> TSI[("sintase_occupancy")]
    PR["PrevReal"] --> EPR["/api/prev-real"]
  end
  subgraph Folha["Apuração da Folha"]
    FI["Importacao → extrato"] --> EFI["/api/folha/import"] --> TFI[("folha_importacoes / _lancamentos")]
    FA["FolhaApuracao"] --> EFA["/api/folha/apuracao/*<br/>(mapear, processar, síntese, conferência)"]
    EFA --> TFA[("folha_apuracoes_mensais / rubricas / setores")]
    FP["FolhaPagamento (mês)"] --> EFP["/api/folha (+rubricas, +custo)"]
  end
`;

export const MOD_ADMIN = `
flowchart LR
  subgraph Admin["Administração / Cadastros"]
    US["Usuarios"] --> EUS["/api/users • /api/roles • /api/permissions/catalog"]
    EUS --> TUS[("users / app_roles / role_permissions / user_sectors")]
    CA["Cadastros"] --> ECA["/api/sectors • /api/crds • /api/cargos • /api/colaboradores • /api/categories • /api/currencies • /api/payment-methods"]
    CO["Configuracoes"] --> ECO["/api/pdv-locais"]
    IN["Investimentos"] --> EIN["/api/investimentos"] --> TIN[("investimentos")]
    ID["Indicadores"] --> EID["/api/indicadores (+cell, +month, +parametros)"] --> TID[("indicadores_mensais / _parametros")]
    PS["PainelSetorial"] --> EPS["/api/paineis/:key"] --> TPS[("painel_*")]
    SG["Sugestoes"] --> ESG["/api/suggestions"] --> TSG[("user_suggestions")]
  end
`;

export const FLUXO_AUTH = `
sequenceDiagram
  actor U as Usuário
  participant SPA as App.tsx (SPA)
  participant API as Express /api/auth
  participant DB as Supabase (users, role_permissions)
  U->>SPA: informa email + senha
  SPA->>API: POST /api/auth/login
  API->>DB: busca user + verifica bcrypt
  DB-->>API: user + permissions
  API-->>SPA: Set-Cookie httpOnly (JWT) + user
  Note over SPA: no reload chama /api/auth/me
  SPA->>API: GET /api/auth/me (cookie)
  API-->>SPA: user { role, permissions[] }
  SPA->>SPA: Sidebar + canAccessTab por papel
  U->>SPA: logout
  SPA->>API: POST /api/auth/logout (limpa cookie)
`;

export const FLUXO_IMPORT = `
sequenceDiagram
  actor A as Admin/Controle
  participant IMP as Importacao (page)
  participant API as Express /api/import
  participant XL as Parser XLSX/BIFF
  participant DB as Supabase
  A->>IMP: envia arquivo (.xls do Desbravador)
  IMP->>API: POST /api/import/{tipo}/preview
  API->>XL: parseia planilha
  XL-->>API: linhas normalizadas
  API-->>IMP: prévia (conferência)
  A->>IMP: confirma
  IMP->>API: POST /api/import/{tipo}/commit
  API->>DB: upsert em *_rows / snapshots
  API->>DB: registra import_history (undo)
  DB-->>API: ok
  API-->>IMP: resumo importado
  Note over DB: RelatorioCrd/Requisicoes/RDS/CMV passam a ler os dados
`;

export const FLUXO_APROVACAO = `
sequenceDiagram
  actor G as Gestor/Financeiro
  participant AP as Aprovacoes (page)
  participant API as Express
  participant DB as Supabase
  AP->>API: GET /api/aprovacoes
  API->>DB: agrega pendências (requisitions, invoices, manual_entries, contrato_lancamentos, comandas)
  DB-->>API: itens pendentes
  API-->>AP: lista unificada
  G->>AP: aprova/reprova item
  AP->>API: PATCH /api/{recurso}/:id/status
  API->>DB: atualiza status + trilha
  DB-->>API: ok
  API-->>AP: item atualizado
`;

export const FLUXO_FOLHA = `
sequenceDiagram
  actor C as Controle
  participant IMP as Importacao
  participant FA as FolhaApuracao
  participant API as Express /api/folha
  participant DB as Supabase (folha_*)
  C->>IMP: importa extrato mensal
  IMP->>API: POST /api/folha/import
  API->>DB: grava folha_importacoes/_lancamentos_importados
  C->>FA: mapeia rubricas → naturezas
  FA->>API: POST /api/folha/apuracao/rubricas/mapear
  C->>FA: processa apuração
  FA->>API: POST /api/folha/apuracao/processar
  API->>DB: calcula encargos e grava folha_apuracoes_mensais
  FA->>API: GET /api/folha/apuracao/sintese + /conferencia
  API-->>FA: sínteses por setor/rubrica + auditoria
`;

export const FLUXO_CMV = `
sequenceDiagram
  actor F as Financeiro
  participant M as CMV (mês)
  participant API as Express /api/cmv
  participant DB as Supabase (cmv_apuracao)
  participant R as CMV (Resumo/Sintético)
  F->>M: digita receitas e requisições do mês
  Note over M: computeCmv() calcula indicadores ao vivo (src/lib/cmv.ts)
  F->>M: Salvar
  M->>API: POST /api/cmv (year, month, inputs)
  API->>DB: upsert cmv_apuracao (year,month)
  DB-->>API: ok
  R->>API: GET /api/cmv/ano
  API->>DB: lê 12 competências
  DB-->>API: linhas
  API-->>R: computeSintetico() consolida o ano
`;

// ---- Referência completa de rotas (180) agrupadas por módulo ----
export type ApiRoute = { method: string; path: string; roles: string };
export type ApiGroup = { group: string; routes: ApiRoute[] };

const R = (method: string, path: string, roles = ''): ApiRoute => ({ method, path, roles });

export const API_REFERENCE: ApiGroup[] = [
  { group: 'Autenticação', routes: [
    R('POST', '/api/auth/login'), R('POST', '/api/auth/logout'), R('GET', '/api/auth/me'),
  ]},
  { group: 'Usuários & Permissões', routes: [
    R('GET', '/api/users', 'admin'), R('POST', '/api/users', 'admin'), R('PATCH', '/api/users/:id', 'admin'), R('DELETE', '/api/users/:id', 'admin'),
    R('GET', '/api/roles', 'admin'), R('POST', '/api/roles', 'admin'), R('PATCH', '/api/roles/:slug', 'admin'), R('DELETE', '/api/roles/:slug', 'admin'),
    R('GET', '/api/roles/:slug/permissions', 'admin'), R('PUT', '/api/roles/:slug/permissions', 'admin'),
    R('GET', '/api/permissions/catalog', 'admin'),
  ]},
  { group: 'Cadastros', routes: [
    R('GET', '/api/sectors'), R('POST', '/api/sectors', 'admin,controle'), R('PATCH', '/api/sectors/:id', 'admin,controle'), R('DELETE', '/api/sectors/:id', 'admin,controle'),
    R('GET', '/api/cargos'), R('POST', '/api/cargos', 'admin,controle'), R('PATCH', '/api/cargos/:id', 'admin,controle'), R('DELETE', '/api/cargos/:id', 'admin,controle'),
    R('GET', '/api/colaboradores'), R('POST', '/api/colaboradores', 'admin,controle'), R('PATCH', '/api/colaboradores/:id', 'admin,controle'), R('DELETE', '/api/colaboradores/:id', 'admin,controle'),
    R('POST', '/api/colaboradores/:id/funcoes', 'admin,controle'), R('DELETE', '/api/colaboradores/:id/funcoes/:cargoId', 'admin,controle'),
    R('GET', '/api/crds'), R('POST', '/api/crds'), R('PATCH', '/api/crds/:id'), R('POST', '/api/crds/import'),
    R('GET', '/api/categories'), R('GET', '/api/currencies'), R('POST', '/api/currencies'),
    R('GET', '/api/payment-methods'), R('POST', '/api/payment-methods'),
    R('GET', '/api/pdv-locais'), R('POST', '/api/pdv-locais', 'admin'), R('PATCH', '/api/pdv-locais/:id', 'admin'), R('DELETE', '/api/pdv-locais/:id', 'admin'),
  ]},
  { group: 'Lançamentos', routes: [
    R('GET', '/api/comandas'), R('POST', '/api/comandas'), R('PATCH', '/api/comandas/:id/status'),
    R('GET', '/api/requisitions'), R('POST', '/api/requisitions'), R('PATCH', '/api/requisitions/:id/status'),
    R('GET', '/api/manual-entries'), R('POST', '/api/manual-entries'), R('PATCH', '/api/manual-entries/:id/status'),
    R('POST', '/api/manual-entries/file'), R('GET', '/api/manual-entries/:id/document-url'), R('DELETE', '/api/manual-entries/:id', 'admin'),
    R('GET', '/api/invoices'), R('GET', '/api/invoices/report'), R('POST', '/api/invoices/extract'), R('POST', '/api/invoices/receipt'),
    R('POST', '/api/invoices/boleto'), R('GET', '/api/invoices/:id/document-url'), R('POST', '/api/invoices'),
    R('PATCH', '/api/invoices/:id/flow'), R('DELETE', '/api/invoices/:id', 'admin'),
    R('GET', '/api/aprovacoes', 'admin,controle,finance'),
  ]},
  { group: 'Contratos & Mensalidades', routes: [
    R('GET', '/api/contratos', 'admin,controle,manager,finance,diretoria'), R('POST', '/api/contratos', 'admin,controle,finance'),
    R('PATCH', '/api/contratos/:id', 'admin,controle,finance'), R('DELETE', '/api/contratos/:id', 'admin,controle'),
    R('POST', '/api/contratos/:id/lancamentos', 'admin,controle,manager,finance'),
    R('GET', '/api/contrato-lancamentos', 'admin,controle,manager,finance,diretoria'), R('PATCH', '/api/contrato-lancamentos/:id/status', 'admin,controle,manager,finance'),
  ]},
  { group: 'Compras', routes: [ R('POST', '/api/ordem-compra/pdf') ]},
  { group: 'Importação', routes: [
    R('GET', '/api/import/history', 'admin,finance,controle'), R('POST', '/api/import/history/:id/undo', 'admin,finance,controle'),
    R('POST', '/api/import/desbravador/preview'), R('POST', '/api/import/desbravador/preview-excel'),
    R('POST', '/api/import/consumo-interno/preview'), R('POST', '/api/import/consumo-interno/commit', 'admin,finance,controle'),
    R('POST', '/api/import/rel-crd/preview'), R('POST', '/api/import/rel-crd/commit'),
    R('POST', '/api/import/provisao-ferias/preview'), R('POST', '/api/import/provisao-13/preview'),
    R('POST', '/api/import/rds/preview'), R('POST', '/api/import/rds/commit', 'admin,finance,controle'),
    R('POST', '/api/import/requisicoes-sintetica/preview'), R('POST', '/api/import/requisicoes-sintetica/commit'),
    R('POST', '/api/import/extrato-mensal/preview'),
  ]},
  { group: 'Apuração de Resultados', routes: [
    R('GET', '/api/rel-crd/competencias', 'admin,finance,controle,manager'), R('GET', '/api/rel-crd', 'admin,finance,controle,manager'),
    R('GET', '/api/requisicoes-sintetica/competencias', 'admin,finance,controle,manager'), R('GET', '/api/requisicoes-sintetica', 'admin,finance,controle,manager'),
    R('GET', '/api/consumo-interno/competencias', 'admin,finance,controle,manager'), R('GET', '/api/consumo-interno', 'admin,finance,controle,manager'),
    R('GET', '/api/cmv/ano', 'admin,finance,controle,manager'), R('GET', '/api/cmv', 'admin,finance,controle,manager'), R('POST', '/api/cmv', 'admin,finance,controle'),
    R('GET', '/api/dre/realizado-rds', 'admin,controle,diretoria'), R('GET', '/api/dre/realizado-crd', 'admin,controle,diretoria'),
    R('GET', '/api/dre/edits', 'admin,controle,diretoria'), R('GET', '/api/dre/ajustes', 'admin,controle,diretoria'), R('PATCH', '/api/dre/cell', 'admin,controle'),
    R('GET', '/api/planilhas', 'admin,finance,controle'), R('GET', '/api/planilhas/:arquivo', 'admin,finance,controle'),
    R('GET', '/api/prev-real'), R('GET', '/api/scenarios'), R('GET', '/api/financial/records'),
  ]},
  { group: 'Apuração de Receita', routes: [
    R('GET', '/api/rds/competencias', 'admin,finance,controle,manager'), R('GET', '/api/rds', 'admin,finance,controle,manager'),
    R('GET', '/api/apuracao/receita', 'admin,finance,controle'),
    R('GET', '/api/sintase'), R('PATCH', '/api/sintase/cell'), R('GET', '/api/sintase/occupancy'), R('PATCH', '/api/sintase/occupancy'),
    R('GET', '/api/uso-consumo-subgrupos'),
  ]},
  { group: 'Base de Orçamento', routes: [
    R('GET', '/api/orcamento'), R('PATCH', '/api/orcamento/cell'), R('POST', '/api/orcamento/import', 'admin'),
    R('GET', '/api/ajustes'), R('PATCH', '/api/ajustes/cell'), R('POST', '/api/ajustes/import', 'admin'),
  ]},
  { group: 'Apuração da Folha', routes: [
    R('GET', '/api/folha'), R('POST', '/api/folha/import', 'admin,finance,controle'),
    R('GET', '/api/folha/rubricas'), R('PATCH', '/api/folha/rubricas/operacao', 'admin,finance,controle'), R('POST', '/api/folha/rubricas/enviar', 'admin,finance,controle'),
    R('GET', '/api/folha/custo'), R('PATCH', '/api/folha/custo/manual', 'admin,finance,controle'),
    R('GET', '/api/folha/apuracao/rubricas'), R('POST', '/api/folha/apuracao/rubricas'), R('PATCH', '/api/folha/apuracao/rubricas/:id'),
    R('GET', '/api/folha/apuracao/encargos'), R('POST', '/api/folha/apuracao/encargos'), R('GET', '/api/folha/apuracao/pendencias'),
    R('POST', '/api/folha/apuracao/rubricas/ignorar'), R('DELETE', '/api/folha/apuracao/rubricas/ignorar/:codigo'),
    R('GET', '/api/folha/apuracao/config'), R('PATCH', '/api/folha/apuracao/config'), R('POST', '/api/folha/apuracao/rubricas/mapear'),
    R('GET', '/api/folha/apuracao/conferencia'), R('POST', '/api/folha/apuracao/processar'),
    R('GET', '/api/folha/apuracao/competencias'), R('GET', '/api/folha/apuracao'), R('GET', '/api/folha/apuracao/sintese'),
    R('GET', '/api/folha/apuracao/relatorio/rubrica'), R('GET', '/api/folha/apuracao/relatorio/setor'), R('GET', '/api/folha/apuracao/auditoria'),
    R('GET', '/api/folha/apuracao/setores'), R('POST', '/api/folha/apuracao/setores'), R('GET', '/api/folha/apuracao/cargos'),
    R('POST', '/api/folha/apuracao/cargos'), R('POST', '/api/folha/apuracao/setores/sync'), R('PATCH', '/api/folha/apuracao/bloquear'),
  ]},
  { group: 'Indicadores & Dashboards', routes: [
    R('GET', '/api/dashboard/indicators'), R('GET', '/api/dashboard/diretoria', 'admin,controle,diretoria'),
    R('GET', '/api/indicadores'), R('GET', '/api/indicadores/anos'), R('PATCH', '/api/indicadores/cell', 'admin,controle,finance'),
    R('POST', '/api/indicadores/month', 'admin,controle,finance'), R('PATCH', '/api/indicadores/parametros', 'admin,controle,finance'), R('GET', '/api/indicadores/comparativo'),
    R('GET', '/api/investimentos', 'admin,controle,manager,finance,diretoria'), R('POST', '/api/investimentos', 'admin,controle,finance'),
    R('PATCH', '/api/investimentos/:id', 'admin,controle,finance'), R('DELETE', '/api/investimentos/:id', 'admin,controle'),
  ]},
  { group: 'Painéis Setoriais', routes: [
    R('GET', '/api/paineis/:key'), R('PUT', '/api/paineis/:key/observacao', 'admin,controle,manager'),
    R('POST', '/api/paineis/ab/quebras', 'admin,controle,manager'), R('DELETE', '/api/paineis/ab/quebras/:id', 'admin,controle,manager'),
    R('POST', '/api/paineis/ab/sobras', 'admin,controle,manager'), R('DELETE', '/api/paineis/ab/sobras/:id', 'admin,controle,manager'),
    R('POST', '/api/paineis/nutricionista/acoes', 'admin,controle,manager'), R('DELETE', '/api/paineis/nutricionista/acoes/:id', 'admin,controle,manager'),
    R('POST', '/api/paineis/controladoria/semanal', 'admin,controle'), R('DELETE', '/api/paineis/controladoria/semanal/:id', 'admin,controle'),
  ]},
  { group: 'Sugestões & Utilidades', routes: [
    R('POST', '/api/suggestions'), R('GET', '/api/suggestions', 'admin'), R('PATCH', '/api/suggestions/:id', 'admin'),
    R('POST', '/api/suggestions/image'), R('GET', '/api/suggestions/:id/image-url', 'admin'),
    R('GET', '/api/storage/signed-url'), R('GET', '/api/supabase/health'),
  ]},
];
