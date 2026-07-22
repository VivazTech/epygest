// Importa a aba "Prev x Real 2026" (CSV exportado do Google Sheets) para o DRE Gerencial.
// Lê as linhas 52-330 (estrutura do DRE) e grava src/data/dre2026.json com a hierarquia
// e os valores mensais Previsto/Realizado/Diferença.
//
// Uso: node scripts/import-dre-prev-real.cjs "caminho/para/Prev x Real 2026.csv"
//
// A hierarquia é declarada explicitamente por número de linha da planilha (1-indexado),
// para que qualquer mudança de layout na planilha falhe de forma visível aqui.

const fs = require("fs");
const path = require("path");

const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Uso: node scripts/import-dre-prev-real.cjs "caminho/para/Prev x Real 2026.csv"');
  process.exit(1);
}

// ---------- Parser CSV (com aspas) ----------
const raw = fs.readFileSync(csvPath, "utf8");
const rows = [];
{
  let row = [], field = "", inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQ) {
      if (c === '"') { if (raw[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
}

// ---------- Números pt-BR; parênteses = negativo; vazio = null ----------
const parseNum = (s) => {
  let t = String(s ?? "").trim();
  if (!t || t === "-" || t.includes("#")) return null;
  const neg = /^\(.*\)$/.test(t);
  t = t.replace(/[()]/g, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
};

// Colunas: rótulo na F (índice 5); 12 meses em 3 colunas cada a partir da G (índice 6).
const labelOf = (r) => String((rows[r - 1] ?? [])[5] ?? "").trim();
const valuesOf = (r) => {
  const cols = rows[r - 1] ?? [];
  const out = [];
  for (let m = 0; m < 12; m++) {
    const base = 6 + m * 3;
    out.push({
      prev: parseNum(cols[base]),
      real: parseNum(cols[base + 1]),
      dif: parseNum(cols[base + 2]),
    });
  }
  return out;
};

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------- Hierarquia por linha da planilha ----------
// t: marca linha de total/subtotal (destaque visual no DRE).
const TREE = [
  { row: 52, t: true, children: [
    { row: 53, children: range(54, 56) },
    { row: 57, children: range(58, 64) },
    { row: 65, children: range(66, 69) },
  ]},
  { row: 71, children: range(72, 75) },
  { row: 77, t: true },
  { row: 79 },
  { row: 81, t: true },
  { row: 83, t: true, children: [
    { row: 84, children: [
      { row: 85, children: range(86, 117) },
      { row: 118, children: range(119, 139) },
      { row: 140, children: range(141, 166) },
      { row: 167, children: range(168, 172) },
      { row: 173, children: range(174, 180) },
      { row: 181, children: range(182, 205) },
      { row: 206, children: range(207, 208) },
      { row: 209, children: [210, 211, 212, 213, { row: 214, children: range(215, 252) }] },
      { row: 253, children: range(254, 267) },
      { row: 268, children: range(269, 270) },
      { row: 271, children: range(272, 276) },
      { row: 277, children: range(278, 280) },
    ]},
    { row: 281, children: [ { row: 282, children: [283] } ] },
    { row: 284, children: [ { row: 285, children: range(286, 307) } ] },
  ]},
  { row: 309, t: true },
  { row: 311, children: range(312, 313) },
  { row: 319, children: range(320, 330) },
];

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const problems = [];
const buildNode = (spec, level) => {
  const node = typeof spec === "number" ? { row: spec } : spec;
  const label = labelOf(node.row);
  if (!label) problems.push(`Linha ${node.row}: rótulo vazio na coluna F.`);
  const children = (node.children ?? []).map((c) => buildNode(c, level + 1));
  return {
    id: `l${node.row}-${slug(label || "linha")}`,
    row: node.row,
    label,
    level,
    isTotal: Boolean(node.t),
    isHeader: children.length > 0,
    values: valuesOf(node.row),
    ...(children.length ? { children } : {}),
  };
};

const tree = TREE.map((spec) => buildNode(spec, 0));

if (problems.length) {
  console.error("Problemas encontrados — o layout da planilha mudou?\n" + problems.join("\n"));
  process.exit(1);
}

const outPath = path.resolve(__dirname, "..", "src", "data", "dre2026.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  year: 2026,
  source: path.basename(csvPath),
  generated_at: new Date().toISOString(),
  rows: tree,
}, null, 1), "utf8");

// Resumo para conferência
let count = 0;
const walk = (nodes, fn) => nodes.forEach((n) => { fn(n); if (n.children) walk(n.children, fn); });
walk(tree, () => count++);
console.log(`OK: ${count} linhas importadas para ${path.relative(process.cwd(), outPath)}`);
walk(tree, (n) => {
  if (n.level <= 1) {
    const jan = n.values[0];
    const fmt = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
    console.log(`${"  ".repeat(n.level)}${String(n.row).padStart(3)} ${n.label}  | jan P=${fmt(jan.prev)} R=${fmt(jan.real)} D=${fmt(jan.dif)}`);
  }
});
