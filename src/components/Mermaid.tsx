import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// Renderizador de diagramas Mermaid com import dinâmico (não entra no bundle
// principal — só é baixado quando a página UML é aberta por um admin).

let mermaidPromise: Promise<any> | null = null;
const loadMermaid = async () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'base',
        themeVariables: {
          primaryColor: '#E6F4F1',
          primaryBorderColor: '#004D40',
          primaryTextColor: '#0f172a',
          lineColor: '#0f766e',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '14px',
        },
        flowchart: { htmlLabels: true, curve: 'basis' },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
};

let uid = 0;

export const Mermaid: React.FC<{ chart: string }> = ({ chart }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const idRef = useRef(`mmd-${++uid}`);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setZoom(1);
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(`${idRef.current}-${++uid}`, chart);
        if (!cancelled) setSvg(svg);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Falha ao renderizar o diagrama.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Renderizando diagrama...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Não foi possível renderizar o diagrama.</p>
          <p className="text-xs opacity-80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-xl border border-slate-100">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 bg-white/90 border border-slate-200 rounded-lg p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          title="Diminuir"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          title="Tamanho normal"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
          title="Ampliar"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-auto p-4" style={{ maxHeight: '75vh' }}>
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: 'max-content' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
};
