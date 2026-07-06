/** Metadados padronizados para o tooltip ValueTrace (origem real dos dados no sistema). */

export type ValueTraceMeta = {
  source: string;
  calculation: string;
  tables?: string;
};

const occ = (pct: number) => `Ocupação do ano: ${pct.toFixed(2)}% (tabela sintase_occupancy).`;

export const valueTrace = {
  sectors: {
    pendingAmount: (sectorName: string, month: number, year: number): ValueTraceMeta => ({
      source: `Compromissos do setor ${sectorName} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'invoices, requisitions, manual_entries',
      calculation:
        'Soma de invoices.amount com due_date no mês e flow_stage ≠ cancelled, requisitions.amount com status=open e date no mês, e manual_entries.amount com status=open e date no mês (API GET /api/sectors).',
    }),
    pendingInvoices: (sectorName: string, month: number, year: number): ValueTraceMeta => ({
      source: `Notas do setor ${sectorName} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'invoices',
      calculation: 'Soma de amount onde due_date está no mês e a nota não foi cancelada (flow_stage ≠ cancelled).',
    }),
    pendingRequisitions: (sectorName: string, month: number, year: number): ValueTraceMeta => ({
      source: `Requisições abertas — ${sectorName} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'requisitions',
      calculation: 'Soma de amount com status=open e date no mês de referência.',
    }),
    pendingManualEntries: (sectorName: string, month: number, year: number): ValueTraceMeta => ({
      source: `Lançamentos manuais abertos — ${sectorName} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'manual_entries',
      calculation: 'Soma de amount com status=open e date no mês de referência.',
    }),
    budgetMonth: (sectorName: string, month: number, year: number, occupancyPct: number): ValueTraceMeta => ({
      source: `Orçamento Síntase — setor ${sectorName} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'crds, crd_monthly_values, sintase_occupancy',
      calculation: `Por CRD ativo do setor: valor do mês em crd_monthly_values (se existir) senão crds.previsto_mes, multiplicado pela ocupação. ${occ(occupancyPct)}`,
    }),
    annualPendingAmount: (sectorName: string, year: number): ValueTraceMeta => ({
      source: `Compromissos anuais — setor ${sectorName} — ${year}`,
      tables: 'invoices, requisitions, manual_entries',
      calculation:
        'Soma de notas (due_date no ano, não canceladas), requisições abertas (date no ano) e lançamentos manuais abertos (date no ano) no setor (API GET /api/sectors).',
    }),
    annualBudget: (sectorName: string, year: number, occupancyPct: number): ValueTraceMeta => ({
      source: `Orçamento anual Síntase — setor ${sectorName} — ${year}`,
      tables: 'crds, crd_monthly_values, sintase_occupancy',
      calculation: `Soma dos 12 meses por CRD ativo (crd_monthly_values ou previsto_mes), com ocupação. ${occ(occupancyPct)}`,
    }),
  },

  invoices: {
    amount: (invoiceNumber: string, provider?: string): ValueTraceMeta => ({
      source: provider ? `Nota ${invoiceNumber} — ${provider}` : `Nota fiscal ${invoiceNumber}`,
      tables: 'invoices',
      calculation: 'Campo amount gravado no lançamento (extraído do PDF ou informado manualmente).',
    }),
    reportTotal: (count: number): ValueTraceMeta => ({
      source: 'Relatório de notas para pagamento',
      tables: 'invoices',
      calculation: `Soma de amount de ${count} nota(s) selecionada(s) no relatório.`,
    }),
  },

  requisitions: {
    amount: (id: number): ValueTraceMeta => ({
      source: `Requisição interna #${id}`,
      tables: 'requisitions',
      calculation: 'Campo amount informado no cadastro da requisição.',
    }),
  },

  manualEntries: {
    amount: (id: number): ValueTraceMeta => ({
      source: `Lançamento manual #${id}`,
      tables: 'manual_entries',
      calculation: 'Campo amount informado no cadastro do lançamento.',
    }),
    openTotal: (): ValueTraceMeta => ({
      source: 'Lançamentos manuais em aberto (visíveis)',
      tables: 'manual_entries',
      calculation: 'Soma de amount com status=open entre os lançamentos listados para o seu perfil.',
    }),
  },

  comandas: {
    itemsCount: (id: number): ValueTraceMeta => ({
      source: `Comanda #${id}`,
      tables: 'comanda_items',
      calculation: 'Quantidade de itens vinculados à comanda.',
    }),
  },

  sintase: {
    cell: (crd: string, grupo: string, detalhado: string, month: number, year: number, occupancyPct: number): ValueTraceMeta => ({
      source: `${crd} › ${grupo} › ${detalhado} — M${month}/${year}`,
      tables: 'crds, crd_monthly_values, sintase_occupancy',
      calculation: `(crd_monthly_values do mês OU crds.previsto_mes) × ocupação. ${occ(occupancyPct)}`,
    }),
    rowTotal: (detalhado: string): ValueTraceMeta => ({
      source: `Linha ${detalhado}`,
      tables: 'crds, crd_monthly_values',
      calculation: 'Soma dos 12 meses (M1..M12) da linha.',
    }),
    crdSubtotalMonth: (crdName: string, month: number, year: number): ValueTraceMeta => ({
      source: `Subtotal ${crdName} — M${month}/${year}`,
      tables: 'crds, crd_monthly_values',
      calculation: 'Soma do mês para todas as linhas (CRDs) do setor macro.',
    }),
    crdGrandTotal: (crdName: string): ValueTraceMeta => ({
      source: `Total do setor ${crdName}`,
      tables: 'crds, crd_monthly_values',
      calculation: 'Soma de todos os meses e linhas do setor.',
    }),
    monthlyGrand: (month: number, year: number): ValueTraceMeta => ({
      source: `Total geral Síntase — M${month}/${year}`,
      tables: 'crds, crd_monthly_values',
      calculation: 'Soma do mês em todos os setores/linhas exibidos.',
    }),
    annualGrand: (year: number): ValueTraceMeta => ({
      source: `Total anual Síntase — ${year}`,
      tables: 'crds, crd_monthly_values',
      calculation: 'Soma de M1..M12 de todos os CRDs.',
    }),
  },

  prevReal: {
    previsto: (grupo: string, detalhado: string, month: number, year: number, occupancyPct: number): ValueTraceMeta => ({
      source: `Previsto — ${grupo} ${detalhado} — ${month}/${year}`,
      tables: 'crds, crd_monthly_values, sintase_occupancy',
      calculation: `(crd_monthly_values OU crds.previsto_mes) × ocupação. Editável via PATCH /api/sintase/cell. ${occ(occupancyPct)}`,
    }),
    realizado: (grupo: string, detalhado: string, month: number, year: number): ValueTraceMeta => ({
      source: `Realizado — ${grupo} ${detalhado} — ${month}/${year}`,
      tables: 'invoices, requisitions, crd_realizado',
      calculation:
        'Soma: notas (invoices.amount por due_date+CRD) + requisições (requisitions.amount) + importações (crd_realizado.value, ex.: consumo interno, folha).',
    }),
    diferenca: (grupo: string, detalhado: string, month: number): ValueTraceMeta => ({
      source: `Diferença — ${grupo} ${detalhado} — mês ${month}`,
      calculation: 'Previsto − Realizado (positivo = abaixo do orçamento).',
    }),
    totalPrevisto: (label: string): ValueTraceMeta => ({
      source: label,
      tables: 'crds, crd_monthly_values',
      calculation: 'Soma dos previstos de janeiro a dezembro da linha ou agrupamento.',
    }),
    totalRealizado: (label: string): ValueTraceMeta => ({
      source: label,
      tables: 'invoices, requisitions, crd_realizado',
      calculation: 'Soma dos realizados de janeiro a dezembro da linha ou agrupamento.',
    }),
    totalDiferenca: (label: string): ValueTraceMeta => ({
      source: label,
      calculation: 'Soma das diferenças mensais (previsto − realizado). Positivo = abaixo do orçamento.',
    }),
  },

  folhaApuracao: {
    proventos: (month: number, year: number): ValueTraceMeta => ({
      source: `Apuração folha — Proventos — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_rubricas, folha_lancamentos_importados, folha_rubricas_parametros, folha_apuracoes_mensais',
      calculation:
        'SUM(valor_provento) dos lançamentos importados onde folha_rubricas_parametros.entra_provento=true (valor_original × fator_provento).',
    }),
    retornos: (month: number, year: number): ValueTraceMeta => ({
      source: `Apuração folha — Retornos — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_lancamentos, folha_rubricas_parametros',
      calculation: 'SUM(valor_retorno) com rubricas marcadas entra_retorno=true.',
    }),
    comissao: (month: number, year: number): ValueTraceMeta => ({
      source: `Apuração folha — Comissão — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_lancamentos, folha_rubricas_parametros',
      calculation: 'SUM(valor_comissao) — rubricas com entra_comissao=true (ex.: cód. 37, 853).',
    }),
    produtividade: (month: number, year: number): ValueTraceMeta => ({
      source: `Apuração folha — Produtividade — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_lancamentos, folha_rubricas_parametros',
      calculation: 'SUM(valor_produtividade) — rubricas com entra_produtividade=true (ex.: cód. 44).',
    }),
    totalSalario: (month: number, year: number): ValueTraceMeta => ({
      source: `Apuração folha — Total salário — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_apuracoes_mensais',
      calculation: 'Proventos + Comissão + Produtividade (configurável em folha_config).',
    }),
    encargo: (label: string, month: number, year: number, formula: string): ValueTraceMeta => ({
      source: `${label} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_apuracoes_mensais, folha_parametros_encargos',
      calculation: formula,
    }),
    totalCusto: (month: number, year: number): ValueTraceMeta => ({
      source: `Total custo folha — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_apuracoes_mensais',
      calculation:
        'Total salário + provisões (13º, férias, 1/3) + FGTS + FGTS prov. + INSS + INSS prov. (ver folha_parametros_encargos).',
    }),
    count: (label: string, month: number, year: number, detail: string): ValueTraceMeta => ({
      source: `${label} — ${String(month).padStart(2, '0')}/${year}`,
      tables: 'folha_pagamento, folha_apuracoes_mensais',
      calculation: detail,
    }),
    /** Metadados por rótulo do card na tela de Apuração Mensal */
    card: (label: string, month: number, year: number): ValueTraceMeta => {
      const enc = (name: string, formula: string) =>
        valueTrace.folhaApuracao.encargo(name, month, year, formula);
      const map: Record<string, ValueTraceMeta> = {
        Proventos: valueTrace.folhaApuracao.proventos(month, year),
        Retornos: valueTrace.folhaApuracao.retornos(month, year),
        Comissão: valueTrace.folhaApuracao.comissao(month, year),
        Produtividade: valueTrace.folhaApuracao.produtividade(month, year),
        'Total Salário': valueTrace.folhaApuracao.totalSalario(month, year),
        FGTS: enc('FGTS', 'total_salario × percentual_fgts (folha_parametros_encargos).'),
        'FGTS Prov. Férias': enc(
          'FGTS provisão férias',
          '(provisão_férias + 1/3_férias) × percentual_fgts.'
        ),
        'FGTS Prov. 13º': enc('FGTS provisão 13º', 'provisão_13 × percentual_fgts.'),
        INSS: enc('INSS', 'total_salario × percentual_inss.'),
        'INSS 13º': enc('INSS 13º', 'provisão_13 × percentual_inss.'),
        'INSS Prov. Férias': enc(
          'INSS provisão férias',
          '(provisão_férias + 1/3_férias) × percentual_inss.'
        ),
        'Total Custo': valueTrace.folhaApuracao.totalCusto(month, year),
        Trabalhando: valueTrace.folhaApuracao.count(
          'Funcionários trabalhando',
          month,
          year,
          'Contagem de funcionários com lançamentos no mês (folha_apuracoes_mensais.qtd_trabalhando).'
        ),
        Funcionários: valueTrace.folhaApuracao.count(
          'Total de funcionários',
          month,
          year,
          'Contagem distinta de funcionários com lançamentos importados no mês.'
        ),
        '13º (Décimo Terceiro)': enc('Provisão 13º', 'total_salario × percentual_provisao_13 (padrão 1/12).'),
        Férias: enc('Provisão férias', 'total_salario × percentual_provisao_ferias (padrão 1/12).'),
        'Um Terço de Férias': enc('1/3 de férias', 'provisão_férias × percentual_um_terco_ferias.'),
      };
      return (
        map[label] ?? {
          source: `${label} — ${String(month).padStart(2, '0')}/${year}`,
          tables: 'folha_apuracoes_mensais',
          calculation: 'Valor gravado na apuração mensal após processamento.',
        }
      );
    },
  },

  cadastros: {
    crdField: (code: string, field: string, label: string): ValueTraceMeta => ({
      source: `CRD ${code}`,
      tables: 'crds',
      calculation: `Campo ${field} (${label}) do cadastro do CRD.`,
    }),
    sectorBudget: (sectorName: string): ValueTraceMeta => ({
      source: `Setor ${sectorName}`,
      tables: 'sectors',
      calculation: 'Campo budget_limit da tabela sectors.',
    }),
  },

  dashboard: {
    indicator: (key: string, title: string): ValueTraceMeta => ({
      source: `Dashboard — ${title}`,
      tables: 'várias (calculado no servidor)',
      calculation: `Indicador "${key}" retornado por GET /api/dashboard/indicators.`,
    }),
  },
};
