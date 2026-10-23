import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, ImagePlus, Lightbulb, Loader2, Send, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getPageLabel } from '../lib/pageLabels';
import { useToast } from '../context/ToastContext';

type SuggestionFabProps = {
  activeTab: string;
};

type RequestKind = 'suggestion' | 'module_request';
type CompanyScope = 'vivaz' | 'aqua' | 'both' | '';

const EMPTY_ANSWERS = {
  menu_location: '',
  who_can_use: '',
  similar_screen: '',
  expected_flow: '',
  frequency: '',
  success_example: '',
};

const MIN_DETAIL = 150;

export const SUGGESTION_OPEN_EVENT = 'vivaz-open-suggestion';
export const SUGGESTION_SAVED_EVENT = 'vivaz-suggestion-saved';

export const openSuggestionModal = (kind: RequestKind = 'suggestion') => {
  window.dispatchEvent(new CustomEvent(SUGGESTION_OPEN_EVENT, { detail: { kind } }));
};

export const SuggestionFab: React.FC<SuggestionFabProps> = ({ activeTab }) => {
  const { showSuccess } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RequestKind>('suggestion');
  const [title, setTitle] = useState('');
  const [companyScope, setCompanyScope] = useState<CompanyScope>('');
  const [fileLabel, setFileLabel] = useState('');
  const [howItShouldWork, setHowItShouldWork] = useState('');
  const [message, setMessage] = useState('');
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [imageName, setImageName] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapFileInputRef = useRef<HTMLInputElement>(null);

  const isModule = kind === 'module_request';
  const detailText = isModule ? howItShouldWork : message;
  const detailLen = detailText.trim().length;

  const clearImage = useCallback(() => {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setImagePath('');
    setImageName('');
  }, []);

  const clearMapFile = useCallback(() => {
    setFilePath('');
    setFileName('');
  }, []);

  const resetForm = () => {
    setKind('suggestion');
    setTitle('');
    setCompanyScope('');
    setFileLabel('');
    setHowItShouldWork('');
    setMessage('');
    setAnswers(EMPTY_ANSWERS);
    clearImage();
    clearMapFile();
    setError('');
  };

  const closeModal = () => {
    if (sending || uploadingImage || uploadingFile) return;
    setOpen(false);
    setError('');
  };

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Cole ou importe apenas imagens (PNG, JPG, WEBP ou GIF).');
      return;
    }
    setUploadingImage(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('image', file);
      const res = await fetch('/api/suggestions/image', { method: 'POST', body: payload });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar a imagem.');
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setImagePath(data.image_path || '');
      setImageName(data.image_name || file.name || 'print.png');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.');
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const uploadMapFile = useCallback(async (file: File) => {
    setUploadingFile(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('file', file);
      const res = await fetch('/api/suggestions/file', { method: 'POST', body: payload });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
      setFilePath(data.file_path || '');
      setFileName(data.file_name || file.name);
      if (!fileLabel.trim()) setFileLabel(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setUploadingFile(false);
    }
  }, [fileLabel]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: RequestKind }>).detail;
      const nextKind = detail?.kind === 'module_request' ? 'module_request' : 'suggestion';
      resetForm();
      setKind(nextKind);
      setOpen(true);
    };
    window.addEventListener(SUGGESTION_OPEN_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(SUGGESTION_OPEN_EVENT, onOpen as EventListener);
    // resetForm is stable enough for open-from-page trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void uploadImage(file);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [open, sending, uploadingImage, uploadingFile, uploadImage]);

  const pageLabel = getPageLabel(activeTab);

  const submit = async () => {
    if (isModule) {
      if (!title.trim()) {
        setError('Informe o nome do módulo ou função.');
        return;
      }
      if (!companyScope) {
        setError('Informe se é para Vivaz, Aqua ou ambos.');
        return;
      }
      if (detailLen < MIN_DETAIL) {
        setError(`Descreva como deve funcionar com no mínimo ${MIN_DETAIL} caracteres (faltam ${MIN_DETAIL - detailLen}).`);
        return;
      }
    } else if (detailLen < 5) {
      setError('Escreva pelo menos algumas palavras na sugestão.');
      return;
    }

    if (detailLen > 8000) {
      setError('O texto deve ter no máximo 8000 caracteres.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          title: title.trim() || null,
          company_scope: companyScope || null,
          file_label: fileLabel.trim() || null,
          file_path: filePath || null,
          file_name: fileName || null,
          how_it_should_work: isModule ? howItShouldWork.trim() : null,
          message: isModule ? howItShouldWork.trim() : message.trim(),
          answers: isModule ? answers : {},
          page_tab: activeTab,
          page_label: pageLabel,
          image_path: imagePath || null,
          image_name: imageName || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Não foi possível enviar.');
        return;
      }
      resetForm();
      setOpen(false);
      showSuccess(isModule ? 'Pedido de módulo enviado. Você pode acompanhar em Sugestões e Novos módulos.' : 'Sugestão enviada. Obrigado!');
      window.dispatchEvent(new CustomEvent(SUGGESTION_SAVED_EVENT, { detail: { kind } }));
    } catch {
      setError('Erro de conexão ao enviar.');
    } finally {
      setSending(false);
    }
  };

  const fieldClass =
    'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-60';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Sugestões e novos módulos"
        aria-label="Sugestões e novos módulos"
        className={cn(
          'fixed bottom-6 right-6 z-[90] w-14 h-14 rounded-full',
          'bg-[#004D40] text-white shadow-lg shadow-emerald-900/25',
          'flex items-center justify-center',
          'hover:bg-[#003d33] hover:scale-105 active:scale-95 transition-all',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2',
          open && 'opacity-0 pointer-events-none scale-90'
        )}
      >
        <Lightbulb className="w-6 h-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeModal} aria-hidden />
          <div className="relative bg-white w-full max-w-2xl max-h-[calc(100dvh-2rem)] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Sugestões e Novos módulos</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Página atual: <span className="font-semibold text-slate-700">{pageLabel}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                  Tipo do pedido *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => setKind('suggestion')}
                    className={cn(
                      'px-3 py-2.5 rounded-xl border text-sm font-semibold text-left transition-colors',
                      kind === 'suggestion'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    Sugestão de melhoria
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => setKind('module_request')}
                    className={cn(
                      'px-3 py-2.5 rounded-xl border text-sm font-semibold text-left transition-colors',
                      kind === 'module_request'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    Solicitar novo módulo / função
                  </button>
                </div>
              </div>

              {isModule ? (
                <>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Nome do módulo ou função *
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={sending}
                      placeholder="Ex.: Relatório de ocupação por PDV"
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Empresa *
                    </label>
                    <select
                      value={companyScope}
                      onChange={(e) => setCompanyScope(e.target.value as CompanyScope)}
                      disabled={sending}
                      className={fieldClass}
                    >
                      <option value="">Selecione...</option>
                      <option value="vivaz">Vivaz Cataratas</option>
                      <option value="aqua">Aquamania</option>
                      <option value="both">Ambos (Vivaz e Aqua)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Em qual menu deve aparecer?
                    </label>
                    <input
                      value={answers.menu_location}
                      onChange={(e) => setAnswers((p) => ({ ...p, menu_location: e.target.value }))}
                      disabled={sending}
                      placeholder="Ex.: Lançamentos, Compras, Apuração de Resultados..."
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Quem pode usar? (perfis)
                    </label>
                    <input
                      value={answers.who_can_use}
                      onChange={(e) => setAnswers((p) => ({ ...p, who_can_use: e.target.value }))}
                      disabled={sending}
                      placeholder="Ex.: Controle e Financeiro; Gestores só visualizam"
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Arquivo que precisa ser mapeado
                    </label>
                    <input
                      value={fileLabel}
                      onChange={(e) => setFileLabel(e.target.value)}
                      disabled={sending}
                      placeholder="Ex.: planilha mensal de vendas, PDF do fornecedor..."
                      className={fieldClass}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={sending || uploadingFile}
                        onClick={() => mapFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                        Anexar arquivo modelo
                      </button>
                      {fileName && (
                        <span className="text-xs text-slate-600 truncate max-w-[220px]" title={fileName}>
                          {fileName}
                          <button
                            type="button"
                            className="ml-2 text-red-600 font-bold hover:underline"
                            onClick={clearMapFile}
                            disabled={sending}
                          >
                            Remover
                          </button>
                        </span>
                      )}
                      <input
                        ref={mapFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,.pdf,image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadMapFile(file);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Existe tela parecida no sistema?
                    </label>
                    <input
                      value={answers.similar_screen}
                      onChange={(e) => setAnswers((p) => ({ ...p, similar_screen: e.target.value }))}
                      disabled={sending}
                      placeholder="Ex.: igual Notas de Serviço, ou Relatório de CRD..."
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Fluxo esperado
                    </label>
                    <input
                      value={answers.expected_flow}
                      onChange={(e) => setAnswers((p) => ({ ...p, expected_flow: e.target.value }))}
                      disabled={sending}
                      placeholder="Ex.: cadastro → aprovação do Controle → pagamento no Financeiro"
                      className={fieldClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                        Frequência de uso
                      </label>
                      <select
                        value={answers.frequency}
                        onChange={(e) => setAnswers((p) => ({ ...p, frequency: e.target.value }))}
                        disabled={sending}
                        className={fieldClass}
                      >
                        <option value="">Selecione...</option>
                        <option value="diario">Diário</option>
                        <option value="semanal">Semanal</option>
                        <option value="mensal">Mensal</option>
                        <option value="sob_demanda">Sob demanda</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                        Como validar se ficou certo?
                      </label>
                      <input
                        value={answers.success_example}
                        onChange={(e) => setAnswers((p) => ({ ...p, success_example: e.target.value }))}
                        disabled={sending}
                        placeholder="Ex.: total do mês bate com a planilha X"
                        className={fieldClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Como deve ser feito * (mín. {MIN_DETAIL} caracteres)
                    </label>
                    <textarea
                      value={howItShouldWork}
                      onChange={(e) => setHowItShouldWork(e.target.value)}
                      disabled={sending}
                      rows={6}
                      placeholder="Descreva com detalhes o que o sistema deve fazer, quais campos, regras, telas e o resultado esperado..."
                      className={cn(fieldClass, 'resize-y min-h-[140px]')}
                    />
                    <p
                      className={cn(
                        'mt-1 text-[11px] tabular-nums',
                        detailLen < MIN_DETAIL ? 'text-amber-700' : 'text-slate-400'
                      )}
                    >
                      {detailLen}/{MIN_DETAIL} mínimo
                      {detailLen < MIN_DETAIL ? ` · faltam ${MIN_DETAIL - detailLen}` : ' · ok para enviar'}
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Sua sugestão *
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Escreva aqui sua ideia, dúvida ou melhoria..."
                    rows={6}
                    autoFocus
                    disabled={sending}
                    className={cn(fieldClass, 'resize-y min-h-[120px]')}
                  />
                  <p className="mt-1 text-[11px] text-slate-400 tabular-nums">{detailLen}/8000</p>
                </div>
              )}

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void uploadImage(file);
                }}
                className={cn(
                  'rounded-xl border border-dashed p-3 transition-colors',
                  dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50/60'
                )}
              >
                {imagePreview ? (
                  <div className="flex items-start gap-3">
                    <img
                      src={imagePreview}
                      alt={imageName || 'Print anexado'}
                      className="w-20 h-20 object-cover rounded-lg border border-slate-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 truncate">{imageName || 'Print'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          disabled={uploadingImage || sending}
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[11px] font-bold text-[#004D40] hover:underline"
                        >
                          Trocar
                        </button>
                        <button
                          type="button"
                          disabled={uploadingImage || sending}
                          onClick={clearImage}
                          className="text-[11px] font-bold text-red-600 hover:underline"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploadingImage || sending}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 text-xs text-slate-600 py-1"
                  >
                    {uploadingImage ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ImagePlus className="w-4 h-4 text-emerald-700" />
                    )}
                    <span>
                      {uploadingImage
                        ? 'Enviando imagem...'
                        : 'Cole um print (Ctrl+V) ou importe uma imagem (opcional)'}
                    </span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadImage(file);
                    e.target.value = '';
                  }}
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0 bg-slate-50/40">
              <button
                type="button"
                disabled={sending}
                onClick={closeModal}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sending || uploadingImage || uploadingFile || (isModule && detailLen < MIN_DETAIL)}
                onClick={() => void submit()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
