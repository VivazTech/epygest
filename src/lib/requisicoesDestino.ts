/** Destinos de classificação das Requisições Sintética (grupo de itens). */
export const REQ_DESTINOS = ['cmv', 'uso_consumo', 'investimento', 'credito_cmv'] as const;

export type ReqDestino = (typeof REQ_DESTINOS)[number] | '';

export const REQ_DESTINO_LABELS: Record<string, string> = {
  cmv: 'CMV',
  uso_consumo: 'Uso e Consumo',
  investimento: 'Investimento',
  credito_cmv: 'Crédito CMV',
};

export const REQ_DESTINO_SHORT: Record<string, string> = {
  cmv: 'CMV',
  uso_consumo: 'U&C',
  investimento: 'INV',
  credito_cmv: 'Créd.',
};

export const REQ_DESTINO_BADGES: Record<string, string> = {
  cmv: 'bg-amber-100 text-amber-800 border-amber-200',
  uso_consumo: 'bg-blue-100 text-blue-800 border-blue-200',
  investimento: 'bg-purple-100 text-purple-800 border-purple-200',
  credito_cmv: 'bg-teal-100 text-teal-800 border-teal-200',
};

export const REQ_DESTINO_ACTIVE: Record<string, string> = {
  cmv: 'bg-amber-400 text-amber-900',
  uso_consumo: 'bg-blue-400 text-blue-900',
  investimento: 'bg-purple-400 text-purple-900',
  credito_cmv: 'bg-teal-500 text-white',
};

/** Mapa padrão grupo de itens → destino (códigos Desbravador). */
export const REQ_DEFAULT_DESTINO_MAP: Record<number, ReqDestino> = {
  7: 'cmv',
  10: 'cmv',
  11: 'cmv',
  15: 'cmv',
  16: 'cmv',
  17: 'cmv',
  25: 'cmv',
  26: 'cmv',
  28: 'cmv',
  30: 'cmv',
  32: 'cmv',
  33: 'cmv',
  34: 'cmv',
  35: 'cmv',
  36: 'cmv',
  37: 'cmv',
  38: 'cmv',
  39: 'cmv',
  45: 'cmv',
  29: 'uso_consumo',
  40: 'uso_consumo',
  41: 'uso_consumo',
  42: 'uso_consumo',
  43: 'uso_consumo',
  44: 'uso_consumo',
  46: 'uso_consumo',
  47: 'uso_consumo',
  48: 'uso_consumo',
  49: 'uso_consumo',
  51: 'uso_consumo',
  52: 'uso_consumo',
  53: 'uso_consumo',
  54: 'uso_consumo',
  56: 'uso_consumo',
  58: 'uso_consumo',
  80: 'uso_consumo',
  81: 'uso_consumo',
  84: 'uso_consumo',
  86: 'uso_consumo',
  125: 'uso_consumo',
  91: 'investimento',
  95: 'investimento',
  98: 'investimento',
  101: 'investimento',
  104: 'investimento',
  111: 'investimento',
};

export const REQ_DESTINOS_VALIDOS = new Set<string>(REQ_DESTINOS);

export function isReqDestinoValid(value: string | null | undefined): value is (typeof REQ_DESTINOS)[number] {
  const v = String(value ?? '').trim();
  return REQ_DESTINOS_VALIDOS.has(v);
}

export function normalizeReqDestino(value: string | null | undefined): ReqDestino {
  const v = String(value ?? '').trim();
  return isReqDestinoValid(v) ? v : '';
}

export function emptyReqDestinoTotals(): Record<string, number> {
  return { cmv: 0, uso_consumo: 0, investimento: 0, credito_cmv: 0, '': 0 };
}

export function addReqDestinoTotal(totals: Record<string, number>, destino: string, valor: number) {
  const key = destino in totals ? destino : '';
  totals[key] = (totals[key] ?? 0) + valor;
}

/** Subclassificação CMV: Alimentos ou Bebidas (quando destino = cmv ou credito_cmv). */
export const REQ_CMV_SUBTIPOS = ['alimentos', 'bebidas'] as const;

export type ReqCmvSubtipo = (typeof REQ_CMV_SUBTIPOS)[number] | '';

export const REQ_CMV_SUBTIPO_LABELS: Record<string, string> = {
  alimentos: 'Alimentos',
  bebidas: 'Bebidas',
};

export const REQ_CMV_SUBTIPO_SHORT: Record<string, string> = {
  alimentos: 'Alim.',
  bebidas: 'Beb.',
};

export const REQ_CMV_SUBTIPO_BADGES: Record<string, string> = {
  alimentos: 'bg-orange-100 text-orange-800 border-orange-200',
  bebidas: 'bg-sky-100 text-sky-800 border-sky-200',
};

export const REQ_CMV_SUBTIPO_ACTIVE: Record<string, string> = {
  alimentos: 'bg-orange-400 text-orange-900',
  bebidas: 'bg-sky-500 text-white',
};

/** Grupos CMV tipicamente de bebidas (códigos Desbravador). Demais CMV → alimentos. */
export const REQ_DEFAULT_CMV_SUBTIPO_MAP: Record<number, ReqCmvSubtipo> = {
  30: 'bebidas',
  32: 'bebidas',
  33: 'bebidas',
  35: 'bebidas',
};

export const REQ_CMV_SUBTIPOS_VALIDOS = new Set<string>(REQ_CMV_SUBTIPOS);

export function isReqDestinoCmv(destino: string | null | undefined): boolean {
  const d = String(destino ?? '').trim();
  return d === 'cmv' || d === 'credito_cmv';
}

export function isReqCmvSubtipoValid(value: string | null | undefined): value is (typeof REQ_CMV_SUBTIPOS)[number] {
  const v = String(value ?? '').trim();
  return REQ_CMV_SUBTIPOS_VALIDOS.has(v);
}

export function normalizeReqCmvSubtipo(value: string | null | undefined): ReqCmvSubtipo {
  const v = String(value ?? '').trim();
  return isReqCmvSubtipoValid(v) ? v : '';
}

export function resolveReqCmvSubtipo(
  grupoCodigo: number,
  destino: ReqDestino,
  explicit?: string | null
): ReqCmvSubtipo | null {
  if (!isReqDestinoCmv(destino)) return null;
  if (isReqCmvSubtipoValid(explicit)) return explicit;
  const fromMap = REQ_DEFAULT_CMV_SUBTIPO_MAP[grupoCodigo];
  if (fromMap) return fromMap;
  return 'alimentos';
}

export function emptyReqCmvSubtipoTotals(): Record<string, number> {
  return { alimentos: 0, bebidas: 0, '': 0 };
}

export function addReqCmvSubtipoTotal(
  totals: Record<string, number>,
  destino: string,
  subtipo: string,
  valor: number
) {
  if (!isReqDestinoCmv(destino)) return;
  const key = subtipo in totals ? subtipo : '';
  totals[key] = (totals[key] ?? 0) + valor;
}
