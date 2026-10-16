import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Lightbulb, Loader2, Send, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getPageLabel } from '../lib/pageLabels';
import { useToast } from '../context/ToastContext';

type SuggestionFabProps = {
  activeTab: string;
};

export const SuggestionFab: React.FC<SuggestionFabProps> = ({ activeTab }) => {
  const { showSuccess } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [imageName, setImageName] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearImage = useCallback(() => {
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setImagePath('');
    setImageName('');
  }, []);

  const closeModal = () => {
    if (sending || uploadingImage) return;
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
  }, [open, sending, uploadingImage, uploadImage]);

  const pageLabel = getPageLabel(activeTab);

  const submit = async () => {
    const text = message.trim();
    if (text.length < 5) {
      setError('Escreva pelo menos algumas palavras na sugestão.');
      return;
    }
    if (text.length > 4000) {
      setError('A sugestão deve ter no máximo 4000 caracteres.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          page_tab: activeTab,
          page_label: pageLabel,
          image_path: imagePath || null,
          image_name: imageName || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Não foi possível enviar a sugestão.');
        return;
      }
      setMessage('');
      clearImage();
      setOpen(false);
      showSuccess('Sugestão enviada. Obrigado!');
    } catch {
      setError('Erro de conexão ao enviar a sugestão.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Enviar sugestão"
        aria-label="Enviar sugestão"
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
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 bg-slate-900/25 backdrop-blur-[2px]">
          <div
            className="absolute inset-0"
            onClick={closeModal}
            aria-hidden
          />
          <div
            className={cn(
              'relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl',
              'bg-[#fffdf6] border border-amber-100/80',
              'animate-in fade-in zoom-in-95 duration-200',
              'sm:mr-2 sm:mb-2'
            )}
            style={{
              backgroundImage:
                'linear-gradient(to bottom, transparent 31px, rgba(148, 163, 184, 0.22) 32px)',
              backgroundSize: '100% 32px',
              backgroundPosition: '0 3.25rem',
            }}
          >
            <div className="px-5 pt-4 pb-3 border-b border-amber-100/80 bg-[#fff9e8]/90 backdrop-blur-sm flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700/70">
                  Bloco de notas
                </p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">Sua sugestão</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Página atual: <span className="font-semibold text-slate-700">{pageLabel}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-amber-50"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva aqui sua ideia, dúvida ou melhoria..."
                rows={6}
                autoFocus
                disabled={sending}
                className={cn(
                  'w-full resize-none bg-transparent border-0 outline-none',
                  'text-sm leading-8 text-slate-800 placeholder:text-slate-400',
                  'disabled:opacity-60'
                )}
              />

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
                  'mt-2 rounded-xl border border-dashed p-3 transition-colors',
                  dragging
                    ? 'border-amber-400 bg-amber-50'
                    : imagePreview
                      ? 'border-amber-200 bg-[#fff9e8]/80'
                      : 'border-amber-200/80 bg-white/40'
                )}
              >
                {imagePreview ? (
                  <div className="flex items-start gap-3">
                    <img
                      src={imagePreview}
                      alt={imageName || 'Print anexado'}
                      className="w-20 h-20 object-cover rounded-lg border border-amber-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 truncate">{imageName || 'Print'}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Cole outro print para substituir.</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          disabled={uploadingImage || sending}
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[11px] font-bold text-[#004D40] hover:underline"
                        >
                          Trocar arquivo
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
                      <ImagePlus className="w-4 h-4 text-amber-700" />
                    )}
                    <span>
                      {uploadingImage
                        ? 'Enviando imagem...'
                        : 'Cole um print (Ctrl+V) ou importe uma imagem'}
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
                <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-amber-100/80 bg-[#fff9e8]/80 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400 tabular-nums">{message.trim().length}/4000</p>
              <button
                type="button"
                disabled={sending || uploadingImage}
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
