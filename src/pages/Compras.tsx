import React, { useState } from 'react';
import { FileCheck, Clock, Loader2, Download, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

type Tab = 'ordem' | 'aprovacao';

type FaturamentoTipo = 'nf_recibo' | 'recibo' | '';
type PagamentoTipo = 'cartao' | 'avista' | 'boleto' | 'pix' | '';

interface OrdemForm {
  data_execucao: string;
  prestador: string;
  telefone: string;
  servico_executado: string;
  servico_setor: string;
  servico_crd: string;
  materiais_descricao: string;
  materiais_setor: string;
  materiais_crd: string;
  valor: string;
  faturamento: FaturamentoTipo;
  pagamento: PagamentoTipo;
  pix_chave: string;
  banco: string;
  agencia: string;
  conta_corrente: string;
  cnpj_cpf: string;
  nome_titular: string;
  observacao: string;
  solicitado_por: string;
}

const EMPTY_FORM: OrdemForm = {
  data_execucao: '',
  prestador: '',
  telefone: '',
  servico_executado: '',
  servico_setor: '',
  servico_crd: '',
  materiais_descricao: '',
  materiais_setor: '',
  materiais_crd: '',
  valor: '',
  faturamento: '',
  pagamento: '',
  pix_chave: '',
  banco: '',
  agencia: '',
  conta_corrente: '',
  cnpj_cpf: '',
  nome_titular: '',
  observacao: '',
  solicitado_por: '',
};

const Label: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
    {children}{required && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

const Field: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('space-y-1', className)}>{children}</div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={cn(
      'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#004D40]/30 focus:border-[#004D40]/40 placeholder:text-slate-300',
      props.className
    )}
  />
);

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea
    {...props}
    className={cn(
      'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#004D40]/30 focus:border-[#004D40]/40 placeholder:text-slate-300 resize-none',
      props.className
    )}
  />
);

const RadioCard: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <label
    className={cn(
      'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
      checked
        ? 'border-[#004D40] bg-emerald-50/60'
        : 'border-slate-200 bg-white hover:bg-slate-50'
    )}
  >
    <input type="radio" checked={checked} onChange={onChange} className="mt-0.5 accent-[#004D40]" />
    <div>
      <p className={cn('text-sm font-semibold', checked ? 'text-[#004D40]' : 'text-slate-700')}>{label}</p>
      {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
    </div>
  </label>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">
    {children}
  </h3>
);

export const ComprasPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('ordem');
  const [form, setForm] = useState<OrdemForm>(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);

  const set = (field: keyof OrdemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const setVal = (field: keyof OrdemForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleGerarPdf = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ordem-compra/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || 'Erro ao gerar PDF.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const prestador = form.prestador.trim().replace(/\s+/g, '_').slice(0, 30) || 'ordem';
      a.download = `ordem_compra_${prestador}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado.');
    } finally {
      setGenerating(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'ordem', label: 'Ordem de Compra', icon: <FileCheck className="w-4 h-4" /> },
    { id: 'aprovacao', label: 'Aprovação Financeiro', icon: <Clock className="w-4 h-4" />, disabled: true },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-900">Compras</h2>
        <p className="text-sm text-slate-500">Geração de ordens de compra e fluxo de aprovação.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-white text-[#004D40] shadow-sm'
                : tab.disabled
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.disabled && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-400 px-1.5 py-0.5 rounded-full">
                Em breve
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'ordem' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Formulário */}
          <div className="xl:col-span-2 space-y-6">

            {/* Dados gerais */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Dados Gerais</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field className="sm:col-span-1">
                  <Label required>Data da Execução</Label>
                  <Input type="date" value={form.data_execucao} onChange={set('data_execucao')} />
                </Field>
                <Field className="sm:col-span-2">
                  <Label required>Prestador</Label>
                  <Input
                    type="text"
                    placeholder="Nome do prestador ou empresa"
                    value={form.prestador}
                    onChange={set('prestador')}
                  />
                </Field>
                <Field className="sm:col-span-1">
                  <Label>Telefone</Label>
                  <Input
                    type="text"
                    placeholder="(45) 99999-9999"
                    value={form.telefone}
                    onChange={set('telefone')}
                  />
                </Field>
                <Field className="sm:col-span-1">
                  <Label required>CNPJ / CPF</Label>
                  <Input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={form.cnpj_cpf}
                    onChange={set('cnpj_cpf')}
                  />
                </Field>
                <Field className="sm:col-span-1">
                  <Label>Nome do titular da conta</Label>
                  <Input
                    type="text"
                    placeholder="Titular"
                    value={form.nome_titular}
                    onChange={set('nome_titular')}
                  />
                </Field>
              </div>
            </div>

            {/* Serviço executado */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Serviço Executado</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field className="sm:col-span-3">
                  <Label>Descrição do Serviço</Label>
                  <Textarea
                    rows={3}
                    placeholder="Descreva o serviço executado..."
                    value={form.servico_executado}
                    onChange={set('servico_executado')}
                  />
                </Field>
                <Field>
                  <Label>Setor</Label>
                  <Input
                    type="text"
                    placeholder="Setor"
                    value={form.servico_setor}
                    onChange={set('servico_setor')}
                  />
                </Field>
                <Field>
                  <Label>CRD</Label>
                  <Input
                    type="text"
                    placeholder="CRD"
                    value={form.servico_crd}
                    onChange={set('servico_crd')}
                  />
                </Field>
              </div>
            </div>

            {/* Materiais */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Materiais</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field className="sm:col-span-3">
                  <Label>Descrição dos Materiais</Label>
                  <Textarea
                    rows={3}
                    placeholder="Descreva os materiais utilizados..."
                    value={form.materiais_descricao}
                    onChange={set('materiais_descricao')}
                  />
                </Field>
                <Field>
                  <Label>Setor</Label>
                  <Input
                    type="text"
                    placeholder="Setor"
                    value={form.materiais_setor}
                    onChange={set('materiais_setor')}
                  />
                </Field>
                <Field>
                  <Label>CRD</Label>
                  <Input
                    type="text"
                    placeholder="CRD"
                    value={form.materiais_crd}
                    onChange={set('materiais_crd')}
                  />
                </Field>
              </div>
            </div>

            {/* Valor */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Valor e Faturamento</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Field>
                  <Label required>Valor a ser Pago (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={form.valor}
                    onChange={set('valor')}
                  />
                </Field>
                <div className="space-y-2">
                  <Label>Tipo de Faturamento</Label>
                  <RadioCard
                    checked={form.faturamento === 'nf_recibo'}
                    onChange={() => setVal('faturamento', 'nf_recibo')}
                    label="Nota Fiscal + Recibo"
                  />
                  <RadioCard
                    checked={form.faturamento === 'recibo'}
                    onChange={() => setVal('faturamento', 'recibo')}
                    label="Recibo (sem nota fiscal)"
                  />
                </div>
              </div>
            </div>

            {/* Condições de Pagamento */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Condições de Pagamento</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <RadioCard
                  checked={form.pagamento === 'cartao'}
                  onChange={() => setVal('pagamento', 'cartao')}
                  label="Cartão de Crédito"
                />
                <RadioCard
                  checked={form.pagamento === 'avista'}
                  onChange={() => setVal('pagamento', 'avista')}
                  label="À Vista — Efetivo"
                />
                <RadioCard
                  checked={form.pagamento === 'boleto'}
                  onChange={() => setVal('pagamento', 'boleto')}
                  label="Boleto Bancário"
                  description="Máximo de prazo possível considerando o vencimento"
                />
                <RadioCard
                  checked={form.pagamento === 'pix'}
                  onChange={() => setVal('pagamento', 'pix')}
                  label="PIX"
                />
              </div>

              {form.pagamento === 'pix' && (
                <Field className="mb-4">
                  <Label>Chave PIX</Label>
                  <Input
                    type="text"
                    placeholder="CNPJ, CPF, e-mail, telefone ou chave aleatória"
                    value={form.pix_chave}
                    onChange={set('pix_chave')}
                  />
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <Field>
                  <Label>Banco</Label>
                  <Input type="text" placeholder="Ex: Bradesco" value={form.banco} onChange={set('banco')} />
                </Field>
                <Field>
                  <Label>Agência</Label>
                  <Input type="text" placeholder="0000-0" value={form.agencia} onChange={set('agencia')} />
                </Field>
                <Field>
                  <Label>C/C</Label>
                  <Input type="text" placeholder="00000-0" value={form.conta_corrente} onChange={set('conta_corrente')} />
                </Field>
              </div>
            </div>

            {/* Observações e assinatura */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <SectionTitle>Observações e Solicitante</SectionTitle>
              <div className="space-y-4">
                <Field>
                  <Label>Observação</Label>
                  <Textarea
                    rows={3}
                    placeholder="Observações adicionais..."
                    value={form.observacao}
                    onChange={set('observacao')}
                  />
                </Field>
                <Field>
                  <Label required>Solicitado por</Label>
                  <Input
                    type="text"
                    placeholder="Nome do solicitante"
                    value={form.solicitado_por}
                    onChange={set('solicitado_por')}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Painel lateral */}
          <div className="space-y-4">
            {/* Ações */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 sticky top-6">
              <h3 className="text-sm font-bold text-slate-800">Ações</h3>

              <button
                onClick={handleGerarPdf}
                disabled={generating || !form.prestador.trim() || !form.valor.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-50 transition-colors"
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
                  : <><Download className="w-4 h-4" /> Gerar PDF para Impressão</>
                }
              </button>

              <button
                onClick={() => setForm(EMPTY_FORM)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Limpar formulário
              </button>

              <p className="text-xs text-slate-400 text-center">
                Prestador e Valor são obrigatórios para gerar o PDF.
              </p>
            </div>

            {/* Lembretes */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Lembretes</p>
              <ul className="space-y-1.5 text-xs text-amber-700">
                <li>• Consultar o orçamento mensal antes de contratar serviços.</li>
                <li>• Valores acima de R$ 800,00 — colher assinatura da Diretoria.</li>
                <li>• Mínimo de 10 dias úteis após entrega da nota fiscal no financeiro.</li>
                <li>• Pagamentos via banco: terças e quintas — somente até 10h00.</li>
                <li>• À Vista (caixa): quintas após 14h00. Entregar ordem com mínimo 3 dias de antecedência.</li>
                <li>• Solicitar ao prestador inserir a chave PIX no corpo da nota fiscal.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aprovacao' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center space-y-3">
          <Clock className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-500">Aprovação Financeiro — em desenvolvimento</p>
          <p className="text-xs text-slate-400">Esta aba receberá as ordens aguardando aprovação do financeiro.</p>
        </div>
      )}
    </div>
  );
};
