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

  dre: {
    edited: (label: string, campo: string, mes: string, userName: string, when: string, originalValue: string): ValueTraceMeta => ({
      source: `Ajuste — ${campo} — ${label} — ${mes}`,
      tables: 'dre_cell_edits',
      calculation: `Ajustado manualmente por ${userName} em ${when}. Valor anterior/planilha: ${originalValue}. Clique para ajustar novamente.`,
    }),
    adjusted: (
      label: string,
      campo: string,
      mes: string,
      userName: string,
      when: string,
      previousValue: string,
      newValue: string,
      motivo: string
    ): ValueTraceMeta => ({
      source: `Ajuste — ${campo} — ${label} — ${mes}`,
      tables: 'dre_cell_edits · dre_cell_edit_history',
      calculation:
        `Registrado por ${userName} em ${when}.\n` +
        `Valor anterior: ${previousValue}\n` +
        `Valor novo: ${newValue}\n` +
        `Motivo: ${motivo}`,
    }),
    imported: (label: string, planilhaRow: number, campo: string, mes: string, source: string): ValueTraceMeta => ({
      source: `${campo} — ${label} — ${mes}`,
      tables: 'src/data/dre2026.json',
      calculation: `Importado da planilha "${source}" (linha ${planilhaRow} da aba, coluna ${campo} de ${mes}) pelo script scripts/import-dre-prev-real.cjs. Clique na célula para abrir o ajuste.`,
    }),
    diferenca: (label: string, mes: string): ValueTraceMeta => ({
      source: `Diferença — ${label} — ${mes}`,
      calculation: 'Realizado − Previsto (negativo = abaixo do previsto, como os valores entre parênteses da planilha).',
    }),
    diferencaRollup: (label: string, mes: string, parts: string): ValueTraceMeta => ({
      source: `Diferença — ${label} — ${mes}`,
      calculation: `Soma das Diferenças de ${parts} (cada uma = Realizado − Previsto).`,
    }),
    total: (label: string, campo: string): ValueTraceMeta => ({
      source: `Total 2026 — ${campo} — ${label}`,
      calculation: 'Soma dos 12 meses da linha (considerando edições manuais, quando houver).',
    }),
    liquido: (campo: string, mes: string): ValueTraceMeta => ({
      source: `${campo} — (=) Resultado Líquido — ${mes}`,
      calculation:
        'Resultado Operacional − Impostos s/ Resultado − Obras e Investimentos (Previsto e Realizado calculados com edições manuais, quando houver). Diferença = Realizado − Previsto.',
    }),
    av: (label: string, mes: string): ValueTraceMeta => ({
      source: `AV (análise vertical) — ${label} — ${mes}`,
      calculation:
        '|Diferença| ÷ |Previsto| × 100 — quanto do previsto a diferença representa. O Previsto é o 100%: ex. previsto R$ 1.000 e realizado R$ 400 → diferença R$ 600 = 60%. Só aparece quando o mês tem Previsto e Diferença. Considera edições manuais.',
    }),
    // AV das linhas de resultado: participação sobre uma base (a base é 100%).
    avRatio: (label: string, mes: string, base: string): ValueTraceMeta => ({
      source: `AV (análise vertical) — ${label} — ${mes}`,
      calculation: `${label} ÷ ${base} × 100 — quanto ${label} representa de ${base} (a base é 100%). Usa o Realizado quando ambos têm realizado no mês; senão o Previsto. Considera edições manuais.`,
    }),
    ah: (label: string, mes: string, mesAnterior: string, serie: string): ValueTraceMeta => ({
      source: `AH (análise horizontal) — ${label} — ${mes}`,
      calculation: `Variação percentual sobre ${mesAnterior}: (valor do mês − valor de ${mesAnterior}) ÷ |valor de ${mesAnterior}| × 100, calculada sobre o ${serie}. Considera edições manuais.`,
    }),
    // AH das linhas de resultado: quanto a diferença representa do previsto.
    ahVariance: (label: string, mes: string): ValueTraceMeta => ({
      source: `AH (análise horizontal) — ${label} — ${mes}`,
      calculation:
        '|Diferença| ÷ |Previsto| × 100 — quanto a diferença representa do previsto (ex.: previsto R$ 1.000, realizado R$ 400 → diferença R$ 600 = 60%). Só aparece quando o mês tem Previsto e Diferença. Considera edições manuais.',
    }),
    rdsDiaria: (mes: string, reportDate?: string | null): ValueTraceMeta => ({
      source: `Realizado — Diária — ${mes}`,
      tables: 'rds_snapshots',
      calculation:
        `Soma Acumulado (R$) das linhas HOSPEDAGEM + HOSPEDAGEM NO-SHOW + UPGRADE / UPSELLING + Taxa de serviço na seção Hospedagem do Relatório Diário de Situação` +
        (reportDate ? ` (data do RDS: ${reportDate})` : '') +
        '. Clique na célula para abrir o ajuste.',
    }),
    rdsMapped: (label: string, mes: string, source: string, reportDate?: string | null): ValueTraceMeta => ({
      source: `Realizado — ${label} — ${mes}`,
      tables: 'rds_snapshots',
      calculation:
        `${source}` +
        (reportDate ? ` (data do RDS: ${reportDate})` : '') +
        '. Clique na célula para abrir o ajuste.',
    }),
    crdMapped: (label: string, mes: string, codigo: string, nome?: string | null): ValueTraceMeta => ({
      source: `Realizado — ${label} — ${mes}`,
      tables: 'rel_crd_rows',
      calculation:
        `Importação › Rel. CRD › SALDO LANÇ da conta ${codigo}` +
        (nome ? ` (${nome})` : '') +
        '. Clique na célula para abrir o ajuste.',
    }),
    rdsRollup: (label: string, mes: string, parts: string): ValueTraceMeta => ({
      source: `Realizado — ${label} — ${mes}`,
      tables: 'rds_snapshots / rel_crd_rows (+ edições manuais dos filhos, se houver)',
      calculation: `Soma do Realizado de ${parts}. Clique na célula para abrir o ajuste.`,
    }),
    derived: (label: string, mes: string, formula: string): ValueTraceMeta => ({
      source: `Realizado — ${label} — ${mes}`,
      calculation: `${formula}. Diferença = Realizado − Previsto. Clique na célula para abrir o ajuste.`,
    }),
    proRataBruta: (label: string, mes: string): ValueTraceMeta => ({
      source: `Realizado — ${label} — ${mes}`,
      calculation:
        'Provisório: Previsto × (Receita Bruta realizada ÷ Receita Bruta prevista). Usado até haver apuração mensal de impostos. Clique na célula para abrir o ajuste.',
    }),
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
