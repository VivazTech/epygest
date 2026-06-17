import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { filterTreeByLabel } from '../lib/search';

type MonthData = {
  actual: number;
  target: number;
};

interface DRERow {
  id: string;
  label: string;
  level: number;
  isHeader?: boolean;
  isTotal?: boolean;
  values: MonthData[];
  children?: DRERow[];
}

const months = ['Maio de 2026', 'Junho de 2026', 'Julho de 2026', 'Agosto de 2026', 'Setembro de 2026'];

const rowValues = (actuals: number[], targetFactor = 1.04): MonthData[] =>
  actuals.map((actual) => ({ actual, target: actual * targetFactor }));

const dreRows: DRERow[] = [
  {
    id: 'receita-diarias',
    label: 'Receita de Diárias',
    level: 0,
    isHeader: true,
    values: rowValues([239450.00, 250220.00, 261105.00, 256430.00, 252990.00]),
    children: [
      {
        id: 'diaria',
        label: 'Diária',
        level: 1,
        values: rowValues([182500.00, 191200.00, 198800.00, 196100.00, 193450.00], 1.03),
      },
      {
        id: 'cafe-manha',
        label: 'Café da manhã',
        level: 1,
        values: rowValues([38750.00, 40120.00, 42030.00, 40800.00, 40210.00], 1.05),
      },
      {
        id: 'map-fap',
        label: 'MAP e FAP',
        level: 1,
        values: rowValues([18200.00, 18900.00, 20275.00, 19530.00, 19330.00], 1.04),
      },
    ],
  },
  {
    id: 'receita-ab',
    label: 'Receita de A&B',
    level: 0,
    isHeader: true,
    values: rowValues([121850.00, 126920.00, 132410.00, 128830.00, 126560.00]),
    children: [
      { id: 'frigobar', label: 'Frigobar', level: 1, values: rowValues([13120.00, 13680.00, 14250.00, 13990.00, 13640.00], 1.03) },
      { id: 'room-service', label: 'Room Service', level: 1, values: rowValues([14850.00, 15310.00, 16040.00, 15780.00, 15490.00], 1.03) },
      { id: 'bar-gaia', label: 'Bar Gaia', level: 1, values: rowValues([19800.00, 20570.00, 21420.00, 20960.00, 20510.00], 1.03) },
      { id: 'rest-allegro', label: 'Rest. Allegro', level: 1, values: rowValues([24500.00, 25540.00, 26780.00, 25940.00, 25480.00], 1.04) },
      { id: 'rest-terraza', label: 'Rest. Terraza', level: 1, values: rowValues([22150.00, 22990.00, 23860.00, 23120.00, 22810.00], 1.03) },
      { id: 'eventos-banquete', label: 'Eventos Banquete', level: 1, values: rowValues([17130.00, 17790.00, 18620.00, 18140.00, 17790.00], 1.04) },
      { id: 'pizzaria', label: 'Pizzaria', level: 1, values: rowValues([10300.00, 11040.00, 11440.00, 10900.00, 10840.00], 1.03) },
    ],
  },
  {
    id: 'outras-receitas',
    label: 'Outras Receitas',
    level: 0,
    isHeader: true,
    values: rowValues([71000.00, 73120.00, 75940.00, 74410.00, 73290.00]),
    children: [
      { id: 'estacionamento', label: 'Estacionamento', level: 1, values: rowValues([12100.00, 12640.00, 13210.00, 12980.00, 12690.00], 1.03) },
      { id: 'outras', label: 'Outras', level: 1, values: rowValues([8900.00, 9320.00, 9710.00, 9440.00, 9300.00], 1.04) },
      { id: 'aluguel-eventos', label: 'Aluguel Eventos', level: 1, values: rowValues([28100.00, 28970.00, 30220.00, 29680.00, 29100.00], 1.04) },
      { id: 'spa', label: 'SPA', level: 1, values: rowValues([21900.00, 22190.00, 22800.00, 22310.00, 22200.00], 1.03) },
    ],
  },
  {
    id: 'impostos-fat',
    label: '(-) IMPOSTOS S/ FATURAMENTO',
    level: 0,
    isHeader: true,
    values: rowValues([-45770.00, -47720.00, -49840.00, -48990.00, -48220.00], 1.02),
    children: [
      { id: 'iss', label: 'ISS', level: 1, values: rowValues([-12910.00, -13500.00, -14020.00, -13790.00, -13680.00], 1.02) },
      { id: 'icms', label: 'ICMS', level: 1, values: rowValues([-17100.00, -17740.00, -18610.00, -18220.00, -17990.00], 1.02) },
      { id: 'pis', label: 'PIS', level: 1, values: rowValues([-7250.00, -7600.00, -7920.00, -7780.00, -7650.00], 1.02) },
      { id: 'cofins', label: 'COFINS', level: 1, values: rowValues([-8510.00, -8880.00, -9290.00, -9200.00, -8900.00], 1.02) },
    ],
  },
  {
    id: 'receita-liquida',
    label: '(=) RECEITA LÍQUIDA',
    level: 0,
    isTotal: true,
    values: rowValues([386530.00, 402540.00, 419615.00, 410680.00, 404620.00], 1.03),
  },
  {
    id: 'cmv',
    label: '(-) CMV',
    level: 0,
    isHeader: true,
    values: rowValues([-169530.00, -178310.00, -185140.00, -181020.00, -177900.00], 1.03),
  },
  {
    id: 'resultado-bruto',
    label: '(=) RESULTADO BRUTO',
    level: 0,
    isTotal: true,
    values: rowValues([217000.00, 224230.00, 234475.00, 229660.00, 226720.00], 1.03),
  },
  {
    id: 'despesas-mensais',
    label: 'Despesas Mensais',
    level: 0,
    isHeader: true,
    values: rowValues([-61240.00, -62990.00, -64820.00, -64110.00, -63300.00], 1.03),
    children: [
      { id: 'seguro-vida-grupo', label: 'SEGURO VIDA EM GRUPO (350)', level: 1, values: rowValues([-2350, -2400, -2450, -2420, -2410], 1.02) },
      { id: 'apresentacao-musical-rest', label: 'APRESENTAÇÃO MUSICAL RESTAURANTE/PISCINA (364)', level: 1, values: rowValues([-4200, -4300, -4500, -4400, -4380], 1.03) },
      { id: 'telefone', label: 'TELEFONE (366)', level: 1, values: rowValues([-1300, -1320, -1380, -1360, -1350], 1.02) },
      { id: 'energia', label: 'ENERGIA (367)', level: 1, values: rowValues([-16200, -16800, -17500, -17100, -16950], 1.03) },
      { id: 'agua', label: 'AGUA (368)', level: 1, values: rowValues([-6900, -7100, -7350, -7200, -7180], 1.03) },
      { id: 'telefone-celular', label: 'TELEFONE CELULAR (369)', level: 1, values: rowValues([-1150, -1200, -1240, -1210, -1200], 1.02) },
      { id: 'consultorias-mensais', label: 'CONSULTORIAS MENSAIS (371)', level: 1, values: rowValues([-5200, -5400, -5600, -5500, -5450], 1.03) },
      { id: 'honorarios-contabeis', label: 'HONORARIOS CONTABEIS (373)', level: 1, values: rowValues([-4800, -4900, -5100, -5050, -5000], 1.02) },
      { id: 'sistema-gestao', label: 'SISTEMA DE GESTÃO (376)', level: 1, values: rowValues([-3900, -3950, -4100, -4050, -4020], 1.02) },
      { id: 'servico-internet', label: 'SERVIÇO INTERNET (383)', level: 1, values: rowValues([-2100, -2150, -2200, -2180, -2170], 1.02) },
      { id: 'servicos-seguranca', label: 'SERVIÇOS SEGURANÇA (386)', level: 1, values: rowValues([-3100, -3200, -3300, -3250, -3230], 1.03) },
    ],
  },
  {
    id: 'manutencao-geral',
    label: 'Manutenção Geral',
    level: 0,
    isHeader: true,
    values: rowValues([-28400.00, -29150.00, -30520.00, -29830.00, -29410.00], 1.03),
    children: [
      { id: 'manut-elevadores', label: 'MANUTENÇÃO ELEVADORES (377)', level: 1, values: rowValues([-4600, -4750, -4900, -4820, -4780], 1.03) },
      { id: 'manut-lavanderia', label: 'MANUTENÇAO LAVANDERIA (389)', level: 1, values: rowValues([-3200, -3300, -3420, -3380, -3350], 1.03) },
      { id: 'conserto-maquinas', label: 'CONSERTO MÁQUINAS DIVERSAS (404)', level: 1, values: rowValues([-4100, -4200, -4450, -4350, -4300], 1.03) },
      { id: 'gerador', label: 'GERADOR (406)', level: 1, values: rowValues([-2700, -2780, -2890, -2830, -2810], 1.03) },
      { id: 'chaves-fechaduras', label: 'CHAVES/FECHADURAS (407)', level: 1, values: rowValues([-850, -900, -940, -920, -910], 1.02) },
      { id: 'servicos-limpeza', label: 'SERVICOS DE LIMPEZA (414)', level: 1, values: rowValues([-5900, -6050, -6280, -6160, -6100], 1.03) },
      { id: 'manut-hidraulica', label: 'MANUTENCAO HIDRAULICA (508)', level: 1, values: rowValues([-2100, -2200, -2300, -2250, -2230], 1.03) },
    ],
  },
  {
    id: 'despesas-diversas-op',
    label: 'Despesas Diversas',
    level: 0,
    isHeader: true,
    values: rowValues([-18250.00, -19040.00, -19820.00, -19450.00, -19220.00], 1.03),
    children: [
      { id: 'servico-recreacao', label: 'SERVIÇO DE RECREAÇÃO (390)', level: 1, values: rowValues([-2100, -2200, -2300, -2250, -2230], 1.03) },
      { id: 'correio', label: 'CORREIO (420)', level: 1, values: rowValues([-380, -410, -430, -420, -415], 1.02) },
      { id: 'desp-cartorio', label: 'DESPESA CARTÓRIO (421)', level: 1, values: rowValues([-520, -560, -600, -580, -575], 1.03) },
      { id: 'cursos-treinamentos', label: 'CURSOS/TREINAMENTOS/CAPACITACOES (423)', level: 1, values: rowValues([-1900, -2100, -2200, -2150, -2120], 1.03) },
      { id: 'despesas-adm', label: 'DESPESAS ADMINISTRATIVAS (424)', level: 1, values: rowValues([-3600, -3750, -3900, -3820, -3800], 1.03) },
      { id: 'impressoes-graficas', label: 'IMPRESSOES GRAFICAS (426)', level: 1, values: rowValues([-980, -1020, -1080, -1050, -1040], 1.03) },
      { id: 'eventos-calendario', label: 'EVENTOS DE CALENDÁRIO (428)', level: 1, values: rowValues([-4200, -4400, -4600, -4500, -4450], 1.03) },
      { id: 'reembolso-hospede', label: 'REEMBOLSO HOSPEDE (521)', level: 1, values: rowValues([-1600, -1700, -1750, -1720, -1710], 1.02) },
    ],
  },
  {
    id: 'financeiras',
    label: 'Financeiras',
    level: 0,
    isHeader: true,
    values: rowValues([-13200.00, -13980.00, -14420.00, -14110.00, -14000.00], 1.03),
    children: [
      { id: 'descontos-concedidos', label: 'Descontos Concedidos (155)', level: 1, values: rowValues([-3100, -3300, -3400, -3350, -3320], 1.03) },
      { id: 'juros-pagos', label: 'Juros Pagos (157)', level: 1, values: rowValues([-2900, -3050, -3150, -3100, -3080], 1.03) },
      { id: 'juros-financiamentos', label: 'Juros Pagos sobre empréstimos e financiamentos (158)', level: 1, values: rowValues([-4200, -4500, -4700, -4600, -4580], 1.03) },
      { id: 'quebra-caixa', label: 'QUEBRA CAIXA (281)', level: 1, values: rowValues([-750, -820, -860, -840, -830], 1.02) },
      { id: 'perda-clientes', label: 'PERDA CLIENTES (363)', level: 1, values: rowValues([-2250, -2310, -2310, -2220, -2190], 1.02) },
    ],
  },
  {
    id: 'despesas-bancarias',
    label: 'Despesas Bancárias',
    level: 0,
    isHeader: true,
    values: rowValues([-9420.00, -9800.00, -10110.00, -9950.00, -9870.00], 1.03),
    children: [
      { id: 'desp-bancarias-base', label: 'Despesas Bancárias (156)', level: 1, values: rowValues([-2400, -2500, -2550, -2520, -2500], 1.02) },
      { id: 'desp-itau', label: 'DESPESAS BANCO ITAU (443)', level: 1, values: rowValues([-1750, -1800, -1890, -1840, -1830], 1.03) },
      { id: 'desp-bradesco', label: 'DESPESAS BANCO BRADESCO (445)', level: 1, values: rowValues([-1420, -1480, -1530, -1510, -1500], 1.03) },
      { id: 'desp-sicoob', label: 'DESPESAS BANCO SICOOB (447)', level: 1, values: rowValues([-1180, -1250, -1310, -1280, -1270], 1.03) },
      { id: 'iof-op', label: 'IOF S/ OPERACOES (448)', level: 1, values: rowValues([-980, -1030, -1080, -1050, -1040], 1.03) },
      { id: 'tarifa-fornecedor', label: 'CUSTO TARIFA FORNECEDOR (450)', level: 1, values: rowValues([-920, -980, -1010, -995, -980], 1.03) },
      { id: 'recebto-exterior', label: 'DESPESA RECEBTO EXTERIOR (451)', level: 1, values: rowValues([-770, -760, -740, -755, -750], 1.02) },
    ],
  },
  {
    id: 'tributos-taxas',
    label: 'Tributos e Taxas',
    level: 0,
    isHeader: true,
    values: rowValues([-21840.00, -22520.00, -23310.00, -22920.00, -22610.00], 1.03),
    children: [
      { id: 'funrural', label: 'FUNRURAL (321)', level: 1, values: rowValues([-1280, -1340, -1390, -1370, -1360], 1.03) },
      { id: 'iptu', label: 'IPTU (323)', level: 1, values: rowValues([-3400, -3400, -3400, -3400, -3400], 1.00) },
      { id: 'ipva', label: 'IPVA (324)', level: 1, values: rowValues([-1200, -1200, -1200, -1200, -1200], 1.00) },
      { id: 'alvara-prefeitura', label: 'ALVARA PREFEITURA (325)', level: 1, values: rowValues([-950, -950, -980, -980, -980], 1.01) },
      { id: 'taxa-bombeiros', label: 'TAXA BOMBEIROS (326)', level: 1, values: rowValues([-840, -860, -880, -870, -860], 1.02) },
      { id: 'inss-fat', label: 'INSS S FATURAMENTO (329)', level: 1, values: rowValues([-4600, -4750, -4920, -4860, -4820], 1.03) },
      { id: 'retencao-pis', label: 'RETENÇÃO PIS NOTAS DE TERCEIROS (331)', level: 1, values: rowValues([-1180, -1210, -1260, -1240, -1230], 1.02) },
      { id: 'retencao-cofins', label: 'RETENÇÃO COFINS NOTAS DE TERCEIROS (332)', level: 1, values: rowValues([-1360, -1400, -1450, -1430, -1420], 1.02) },
      { id: 'multa-juros-impostos', label: 'MULTA JUROS S IMPOSTOS (342)', level: 1, values: rowValues([-980, -1040, -1100, -1060, -1040], 1.03) },
      { id: 'taxa-lixo', label: 'TAXA DE COLETA DE LIXO (346)', level: 1, values: rowValues([-1050, -1090, -1130, -1110, -1090], 1.02) },
    ],
  },
  {
    id: 'seguros',
    label: 'Seguros',
    level: 0,
    isHeader: true,
    values: rowValues([-5240.00, -5380.00, -5510.00, -5460.00, -5420.00], 1.02),
    children: [
      { id: 'seguro-predio', label: 'SEGURO PREDIO (348)', level: 1, values: rowValues([-3240, -3320, -3390, -3360, -3340], 1.02) },
      { id: 'seguro-veiculo', label: 'SEGURO VEICULO (349)', level: 1, values: rowValues([-2000, -2060, -2120, -2100, -2080], 1.02) },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    level: 0,
    isHeader: true,
    values: rowValues([-18620.00, -19410.00, -20190.00, -19840.00, -19650.00], 1.03),
    children: [
      { id: 'desp-comercial-mkt', label: 'DESPESA COMERCIAL MENSAL E MARKETING (352)', level: 1, values: rowValues([-5100, -5300, -5480, -5400, -5360], 1.03) },
      { id: 'producao-imagens', label: 'PRODUÇÃO DE IMAGENS (355)', level: 1, values: rowValues([-2400, -2500, -2620, -2570, -2540], 1.03) },
      { id: 'workshop-congressos', label: 'WORKSHOP E CONGRESSOS (356)', level: 1, values: rowValues([-1800, -1890, -1960, -1930, -1910], 1.03) },
      { id: 'patrocinio-anuncio', label: 'PATROCINIO/ ANUNCIO (358)', level: 1, values: rowValues([-4200, -4450, -4700, -4580, -4520], 1.04) },
      { id: 'despesas-eventos', label: 'DESPESAS COM EVENTOS (359)', level: 1, values: rowValues([-2900, -3050, -3180, -3130, -3090], 1.03) },
      { id: 'permutas-publicidade', label: 'PERMUTAS PUBLICIDADE (360)', level: 1, values: rowValues([-1220, -1280, -1330, -1310, -1290], 1.03) },
    ],
  },
  {
    id: 'viagens',
    label: 'Viagens',
    level: 0,
    isHeader: true,
    values: rowValues([-3320.00, -3470.00, -3620.00, -3550.00, -3510.00], 1.03),
    children: [
      { id: 'viagem-edilson', label: 'VIAGEM EDILSON/LUIZA (353)', level: 1, values: rowValues([-1450, -1520, -1590, -1550, -1540], 1.03) },
      { id: 'viagens-comerciais', label: 'VIAGENS COMERCIAIS (354)', level: 1, values: rowValues([-1870, -1950, -2030, -2000, -1970], 1.03) },
    ],
  },
  {
    id: 'comissoes',
    label: 'Comissões',
    level: 0,
    isHeader: true,
    values: rowValues([-14600.00, -15190.00, -15840.00, -15570.00, -15380.00], 1.03),
    children: [
      { id: 'comissao-faturamentos', label: 'COMISSÃO FATURAMENTOS (362)', level: 1, values: rowValues([-6900, -7150, -7440, -7300, -7220], 1.03) },
      { id: 'comissao-ab-recepcao', label: 'COMISSÃO A&B / RECEPÇÃO/ COMERCIAL ZZ (529)', level: 1, values: rowValues([-3200, -3350, -3470, -3410, -3380], 1.03) },
      { id: 'premio-produtividade', label: 'Prêmio de Produtividade', level: 1, values: rowValues([-1800, -1900, -1980, -1940, -1920], 1.03) },
      { id: 'comissao-gerencia', label: 'COMISSÃO GERÊNCIA (597)', level: 1, values: rowValues([-2700, -2790, -2950, -2920, -2860], 1.03) },
    ],
  },
  {
    id: 'desp-cartao-vendas',
    label: 'Despesas Cartão de Crédito s/ Vendas',
    level: 0,
    isHeader: true,
    values: rowValues([-10840.00, -11220.00, -11710.00, -11540.00, -11380.00], 1.03),
    children: [
      { id: 'taxa-cartao', label: 'Comissão taxa cartão de credito (154)', level: 1, values: rowValues([-7100, -7350, -7700, -7560, -7420], 1.03) },
      { id: 'aluguel-maquina', label: 'Aluguel Máquina de Cartão de Crédito (571)', level: 1, values: rowValues([-980, -1010, -1040, -1030, -1020], 1.02) },
      { id: 'perdas-cartao-case', label: 'PERDAS CARTÃO DE CREDITO - CASE (628)', level: 1, values: rowValues([-2760, -2860, -2970, -2950, -2940], 1.03) },
    ],
  },
  {
    id: 'csp',
    label: 'CSP',
    level: 0,
    isHeader: true,
    values: rowValues([-4280.00, -4450.00, -4630.00, -4550.00, -4480.00], 1.03),
    children: [
      { id: 'repasse-aquamania', label: 'REPASSE AQUAMANIA - PASSAPORTES E CONSUMO (422)', level: 1, values: rowValues([-4280, -4450, -4630, -4550, -4480], 1.03) },
    ],
  },
  {
    id: 'folha-pagamento',
    label: 'Folha pagamento',
    level: 0,
    isHeader: true,
    values: rowValues([-139200.00, -144800.00, -150900.00, -148700.00, -146900.00], 1.03),
    children: [
      { id: 'folha-base', label: 'Folha de pagamento', level: 1, values: rowValues([-96200, -99800, -104200, -102800, -101500], 1.03) },
      { id: 'vale-transporte', label: 'VALE TRANSPORTE (267)', level: 1, values: rowValues([-5800, -6000, -6200, -6100, -6020], 1.03) },
      { id: 'pro-labore', label: 'PRO-LABORE (283)', level: 1, values: rowValues([-7800, -8000, -8300, -8200, -8150], 1.03) },
      { id: 'convenios-medicos', label: 'CONVENIOS MÉDICOS (297)', level: 1, values: rowValues([-6200, -6400, -6650, -6580, -6510], 1.03) },
      { id: 'convenio-odonto', label: 'CONVÊNIO ODONTOLÓGICO (299)', level: 1, values: rowValues([-1450, -1520, -1590, -1560, -1540], 1.03) },
      { id: 'vale-alimentacao', label: 'VALE ALIMENTAÇÃO/REFEIÇÃO HOTEL (308)', level: 1, values: rowValues([-9600, -9900, -10300, -10180, -10090], 1.03) },
      { id: 'bonificacao-funcionarios', label: 'BONIFICAÇÃO FUNCIONÁRIOS (648)', level: 1, values: rowValues([-3400, -3600, -3780, -3700, -3660], 1.03) },
      { id: 'seguranca-trabalho', label: 'SERV SEGURANÇA TRABALHO (382)', level: 1, values: rowValues([-2750, -2880, -3010, -2950, -2920], 1.03) },
      { id: 'uniformes-epis', label: 'UNIFORMES E EPIS', level: 1, values: rowValues([-2000, -2100, -2200, -2140, -2110], 1.03) },
    ],
  },
  {
    id: 'resultado-operacional',
    label: '(=) RESULTADO OPERACIONAL',
    level: 0,
    isTotal: true,
    values: rowValues([118850.00, 117520.00, 122640.00, 120330.00, 119410.00], 1.03),
  },
  {
    id: 'impostos-resultado',
    label: '(-) IMPOSTOS S/ RESULTADO',
    level: 0,
    isHeader: true,
    values: rowValues([-15820.00, -16210.00, -16930.00, -16610.00, -16480.00], 1.03),
    children: [
      { id: 'contrib-social', label: 'CONTRIB SOCIAL (319)', level: 1, values: rowValues([-7420, -7600, -7920, -7780, -7720], 1.03) },
      { id: 'irpj', label: 'IRPJ (320)', level: 1, values: rowValues([-8400, -8610, -9010, -8830, -8760], 1.03) },
    ],
  },
  {
    id: 'obras-investimentos',
    label: 'Obras e Investimentos',
    level: 0,
    isHeader: true,
    values: rowValues([-32440.00, -33620.00, -35200.00, -34510.00, -34190.00], 1.03),
    children: [
      { id: 'redes-incendio', label: 'REDES DE INCENDIO E BOILERS (345)', level: 1, values: rowValues([-6200, -6400, -6720, -6580, -6500], 1.03) },
      { id: 'moveis-geral', label: 'MOVEIS EM GERAL', level: 1, values: rowValues([-3800, -3950, -4100, -4050, -4020], 1.03) },
      { id: 'invest-piscina', label: 'INVESTIMENTO PISCINA AQUECIDA', level: 1, values: rowValues([-5400, -5600, -5900, -5780, -5700], 1.03) },
      { id: 'equip-uso-geral', label: 'EQUIPAMENTOS DE USO GERAL', level: 1, values: rowValues([-4500, -4680, -4900, -4820, -4780], 1.03) },
      { id: 'servicos-invest', label: 'SERVIÇOS DE INVESTIMENTOS (542)', level: 1, values: rowValues([-6200, -6500, -6840, -6700, -6650], 1.03) },
      { id: 'reforma-hotel', label: 'SERVIÇOS REFORMA HOTEL VIVAZ (576)', level: 1, values: rowValues([-6340, -6490, -6740, -6580, -6540], 1.03) },
    ],
  },
];

export const DREPage: React.FC = () => {
  const { query } = useSearch();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'receita-diarias': true,
    'receita-ab': true,
    'outras-receitas': true,
    'impostos-fat': true,
    'despesas-mensais': true,
    'manutencao-geral': true,
    'despesas-diversas-op': true,
    'folha-pagamento': true,
  });

  const filteredDreRows = useMemo(() => filterTreeByLabel(dreRows, query), [query]);

  useEffect(() => {
    if (!query.trim()) return;
    const next: Record<string, boolean> = {};
    const collect = (rows: DRERow[]) => {
      for (const row of rows) {
        if (row.children?.length) next[row.id] = true;
        if (row.children) collect(row.children);
      }
    };
    collect(filteredDreRows);
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [query, filteredDreRows]);

  const totalReceitaByMonth = useMemo(() => {
    const receitas = dreRows.find((row) => row.id === 'receita-liquida');
    return receitas?.values.map((value) => Math.abs(value.actual)) ?? months.map(() => 0);
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getAvPercent = (value: number, monthIndex: number) => {
    const base = totalReceitaByMonth[monthIndex] || 0;
    if (!base) return 0;
    return (Math.abs(value) / base) * 100;
  };

  const getAhPercent = (actual: number, target: number) => {
    if (!target) return 0;
    return ((target - actual) / Math.abs(target)) * 100;
  };

  const renderRow = (row: DRERow): React.ReactNode => {
    const hasChildren = Boolean(row.children?.length);
    const isExpanded = expanded[row.id];

    return (
      <React.Fragment key={row.id}>
        <tr
          className={cn(
            "transition-colors",
            row.isTotal ? "bg-slate-100/80 font-bold" : "hover:bg-slate-50",
            row.isHeader ? "font-semibold text-slate-800" : "text-slate-600"
          )}
        >
          <td className="sticky left-0 z-20 bg-white border-r border-slate-200 min-w-[320px] max-w-[320px] px-4 py-3">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${row.level * 20}px` }}>
              {hasChildren ? (
                <button onClick={() => toggleExpand(row.id)} className="rounded p-0.5 hover:bg-slate-100">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span className="text-sm">{row.label}</span>
            </div>
          </td>

          {row.values.map((monthData, monthIndex) => {
            const av = getAvPercent(monthData.actual, monthIndex);
            const ah = getAhPercent(monthData.actual, monthData.target);
            return (
              <React.Fragment key={`${row.id}-${monthIndex}`}>
                <td className={cn("min-w-[140px] px-3 py-3 text-right text-sm tabular-nums", monthData.actual < 0 ? "text-red-600" : "text-slate-700")}>
                  {formatCurrency(monthData.actual)}
                </td>
                <td className="min-w-[80px] px-3 py-3 text-right text-xs font-semibold text-slate-600 tabular-nums">
                  {av.toFixed(1)}%
                </td>
                <td className={cn("min-w-[80px] px-3 py-3 text-right text-xs font-semibold tabular-nums", ah > 0 ? "text-orange-600" : "text-emerald-600")}>
                  {ah.toFixed(1)}%
                </td>
              </React.Fragment>
            );
          })}
        </tr>
        {hasChildren && isExpanded && row.children?.map((child) => renderRow(child))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">DRE Gerencial</h2>
          <p className="text-sm text-slate-500">
            Tabela com categorias, grupos/subgrupos e colunas por mês: Valentia, AV e AH.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">2026</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 border-b border-slate-200">
                <th rowSpan={2} className="sticky left-0 z-30 min-w-[320px] max-w-[320px] border-r border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Categorias
                </th>
                {months.map((month) => (
                  <th key={month} colSpan={3} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {month}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                {months.map((month) => (
                  <React.Fragment key={`${month}-sub`}>
                    <th className="min-w-[140px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Valentia</th>
                    <th className="min-w-[80px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">AV</th>
                    <th className="min-w-[80px] border-r border-slate-200 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">AH</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDreRows.map((row) => renderRow(row))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
