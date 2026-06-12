import React, { useState } from 'react';
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

type ParsedLine = {
  descricao: string;
  valor: number;
};

type ExcelColumn = {
  index: number;
  name: string;
};

export const ImportacaoPage: React.FC = () => {
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loadingImport, setLoadingImport] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importSource, setImportSource] = useState<'pdf' | 'excel' | null>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [excelColumns, setExcelColumns] = useState<ExcelColumn[]>([]);
  const [descriptionColumnIndex, setDescriptionColumnIndex] = useState<string>('');
  const [valueColumnIndex, setValueColumnIndex] = useState<string>('');
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryCount, setSummaryCount] = useState(0);
  const [error, setError] = useState('');

  const importDesbravadorFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
    manualMapping?: { description_column_index: string; value_column_index: string }
  ) => {
    const file = event.target.files?.[0] || uploadedFile;
    if (!file) return;

    const isExcel = /\.(xlsx|xls)$/i.test(file.name) || [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(file.type);
    const endpoint = isExcel ? '/api/import/desbravador/preview-excel' : '/api/import/desbravador/preview';
    const fileFieldName = isExcel ? 'report_excel' : 'report_pdf';

    setLoadingImport(true);
    setError('');
    setImportFileName(file.name);
    setImportSource(isExcel ? 'excel' : 'pdf');
    setUploadedFile(file);

    const formData = new FormData();
    formData.append(fileFieldName, file);
    formData.append('month', month);
    formData.append('year', year);
    if (isExcel && manualMapping) {
      formData.append('description_column_index', manualMapping.description_column_index);
      formData.append('value_column_index', manualMapping.value_column_index);
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Falha ao processar relatório do Desbravador.');
        return;
      }

      setParsedLines(Array.isArray(data.lines) ? data.lines : []);
      setSummaryTotal(Number(data?.summary?.total || 0));
      setSummaryCount(Number(data?.summary?.lines_count || 0));
      const columns = data?.mapping?.columns;
      if (Array.isArray(columns)) {
        setExcelColumns(columns);
      } else {
        setExcelColumns([]);
      }
      const mappedDescriptionIdx = data?.mapping?.description_column_index;
      const mappedValueIdx = data?.mapping?.value_column_index;
      if (mappedDescriptionIdx !== undefined && mappedDescriptionIdx !== null && Number(mappedDescriptionIdx) >= 0) {
        setDescriptionColumnIndex(String(mappedDescriptionIdx));
      } else if (!manualMapping) {
        setDescriptionColumnIndex('');
      }
      if (mappedValueIdx !== undefined && mappedValueIdx !== null && Number(mappedValueIdx) >= 0) {
        setValueColumnIndex(String(mappedValueIdx));
      } else if (!manualMapping) {
        setValueColumnIndex('');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao importar arquivo.');
    } finally {
      setLoadingImport(false);
      if (event?.target) event.target.value = '';
    }
  };

  const applyManualExcelMapping = async () => {
    if (!uploadedFile) {
      setError('Selecione um arquivo Excel primeiro.');
      return;
    }
    if (descriptionColumnIndex === '' || valueColumnIndex === '') {
      setError('Selecione as colunas de descrição e valor para mapear.');
      return;
    }
    await importDesbravadorFile(
      { target: { files: null, value: '' } } as React.ChangeEvent<HTMLInputElement>,
      {
        description_column_index: descriptionColumnIndex,
        value_column_index: valueColumnIndex,
      }
    );
  };

  const isExcelImport = importSource === 'excel';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Importação</h2>
        <p className="text-sm text-slate-500">
          Previsto vem da Síntase (planilhas importadas manualmente) e realizado vem dos relatórios em PDF do sistema Desbravador.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Previsto (Síntase)</h3>
          </div>
          <p className="text-sm text-slate-600">
            Continue importando manualmente suas planilhas da Síntase para compor o previsto mensal.
          </p>
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            Fonte: importação manual de planilhas (mantida como processo atual).
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Realizado (Desbravador - PDF ou Excel)</h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              placeholder="Mês"
            />
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              placeholder="Ano"
            />
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
            {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loadingImport ? 'Processando arquivo...' : 'Enviar relatório (PDF/Excel)'}
            <input
              type="file"
              accept="application/pdf,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={importDesbravadorFile}
              disabled={loadingImport}
              className="hidden"
            />
          </label>

          {importFileName && !error && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado ({importSource === 'excel' ? 'Excel' : 'PDF'}): {importFileName}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          {isExcelImport && excelColumns.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mapeamento manual assistido</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={descriptionColumnIndex}
                  onChange={(e) => setDescriptionColumnIndex(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                >
                  <option value="">Coluna de descrição</option>
                  {excelColumns.map((column) => (
                    <option key={`desc-${column.index}`} value={String(column.index)}>
                      {column.name}
                    </option>
                  ))}
                </select>
                <select
                  value={valueColumnIndex}
                  onChange={(e) => setValueColumnIndex(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                >
                  <option value="">Coluna de valor</option>
                  {excelColumns.map((column) => (
                    <option key={`value-${column.index}`} value={String(column.index)}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={applyManualExcelMapping}
                disabled={loadingImport}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white bg-[#004D40] hover:bg-[#003d33] disabled:opacity-60 transition-colors"
              >
                {loadingImport ? 'Reprocessando...' : 'Aplicar mapeamento manual'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Prévia do realizado importado</p>
          <div className="text-xs text-slate-600">
            Itens: <span className="font-bold">{summaryCount}</span> • Total: <span className="font-bold">{formatCurrency(summaryTotal)}</span>
          </div>
        </div>

        <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linha do relatório</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Valor (realizado)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {parsedLines.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                    Faça upload de um PDF ou Excel do Desbravador para visualizar os lançamentos mapeados.
                  </td>
                </tr>
              )}
              {parsedLines.map((line, idx) => (
                <tr key={`${line.descricao}-${idx}`} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2 text-sm text-slate-700">{line.descricao}</td>
                  <td className={`px-4 py-2 text-sm text-right font-semibold tabular-nums ${line.valor < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatCurrency(line.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
