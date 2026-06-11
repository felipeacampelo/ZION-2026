import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import {
  createWaitlistInvitePayment,
  getSettings,
  getWaitlistInvite,
  updateWaitlistInvite,
  type Enrollment,
  type FormFieldConfig,
  type Payment,
  type ResponsibleFieldConfig,
} from '../services/api';

const baseInputClass = 'w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:border-dark focus:outline-none';

const defaultFormData: Record<string, any> = {
  nome_completo: '',
  email: '',
  telefone: '',
  data_nascimento: '',
  sexo: '',
  cpf: '',
  rg: '',
  cep: '',
  tamanho_camiseta: '',
  membro_batista_capital: '',
  igreja: '',
  lider_pg: '',
  ja_participou_zion: '',
  imperio_zion: '',
  observacoes: '',
};

const defaultResponsibleData: Record<string, any> = {
  nome_responsavel: '',
  email_responsavel: '',
  telefone_responsavel: '',
};

export default function WaitlistInvite() {
  const navigate = useNavigate();
  const { token = '' } = useParams();
  const [step, setStep] = useState<'confirm' | 'review' | 'payment'>('confirm');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [formFieldsConfig, setFormFieldsConfig] = useState<Record<string, FormFieldConfig>>({});
  const [responsibleFieldsConfig, setResponsibleFieldsConfig] = useState<ResponsibleFieldConfig[]>([]);
  const [enablePixCash, setEnablePixCash] = useState(true);
  const [enablePixInstallment, setEnablePixInstallment] = useState(true);
  const [enableCreditCard, setEnableCreditCard] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD'>('PIX_CASH');
  const [installments, setInstallments] = useState(1);
  const [formData, setFormData] = useState<Record<string, any>>(defaultFormData);
  const [responsibleFormData, setResponsibleFormData] = useState<Record<string, any>>(defaultResponsibleData);

  useEffect(() => {
    const load = async () => {
      try {
        const [inviteRes, settingsRes] = await Promise.all([
          getWaitlistInvite(token),
          getSettings(),
        ]);
        const loadedEnrollment = inviteRes.data.enrollment;
        const loadedFormData = {
          ...defaultFormData,
          ...(loadedEnrollment.form_data || {}),
        };
        const loadedResponsibleData = {
          ...defaultResponsibleData,
          ...((loadedEnrollment.form_data || {}).responsavel || {}),
        };

        setEnrollment(loadedEnrollment);
        setFormData(loadedFormData);
        setResponsibleFormData(loadedResponsibleData);
        setFormFieldsConfig(settingsRes.data.form_fields_config || {});
        setResponsibleFieldsConfig(settingsRes.data.responsible_fields_config || []);
        setEnablePixCash(settingsRes.data.enable_pix_cash);
        setEnablePixInstallment(settingsRes.data.enable_pix_installment);
        setEnableCreditCard(settingsRes.data.enable_credit_card);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Convite inválido ou expirado.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const pricing = useMemo(() => {
    const snapshot = enrollment?.pricing_snapshot || {};
    return {
      pixCash: Number(snapshot.price || enrollment?.batch?.price || 0),
      pixInstallment: Number(snapshot.pix_installment_price || enrollment?.batch?.pix_installment_price || 0),
      creditCard: Number(snapshot.credit_card_price || enrollment?.batch?.credit_card_price || 0),
    };
  }, [enrollment]);

  const createPasswordLink = useMemo(() => {
    const email = formData.email || enrollment?.form_data?.email || '';
    return email ? `/criar-senha?email=${encodeURIComponent(email)}` : '/criar-senha';
  }, [enrollment, formData.email]);

  const responsibleExtraFields = useMemo(
    () => responsibleFieldsConfig.filter((field) => !['nome_responsavel', 'email_responsavel', 'telefone_responsavel'].includes(field.key)),
    [responsibleFieldsConfig],
  );

  const getFieldConfig = (fieldName: string) => {
    return formFieldsConfig[fieldName] || { enabled: true, required: true, label: fieldName };
  };

  const handleSaveReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await updateWaitlistInvite(token, {
        form_data: {
          ...formData,
          responsavel: responsibleFormData,
        },
      });
      setEnrollment(response.data);
      setStep('payment');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.form_data || 'Não foi possível atualizar os dados.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePayment = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await createWaitlistInvitePayment(token, {
        payment_method: paymentMethod,
        installments,
      });
      setPayment(response.data);
      if (paymentMethod === 'CREDIT_CARD' && response.data.payment_url) {
        window.location.href = response.data.payment_url;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.payment_method || 'Não foi possível criar o pagamento.');
    } finally {
      setSaving(false);
    }
  };

  const copyPixCode = async () => {
    if (!payment?.pix_copy_paste) return;
    await navigator.clipboard.writeText(payment.pix_copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderResponsibleField = (field: ResponsibleFieldConfig) => {
    const value = responsibleFormData[field.key] ?? '';
    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.value }))}
          className={baseInputClass}
        >
          <option value="">Selecione</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === 'checkbox') {
      return (
        <label className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.checked }))}
          />
          {field.label}
        </label>
      );
    }
    if (field.type === 'textarea') {
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.value }))}
          className={baseInputClass}
        />
      );
    }
    return (
      <input
        type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text'}
        value={value}
        onChange={(event) => setResponsibleFormData((current) => ({ ...current, [field.key]: event.target.value }))}
        className={baseInputClass}
      />
    );
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-600">Carregando convite...</div>;
  }

  if (!enrollment) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-950">Convite indisponível</h1>
          <p className="mt-4 text-gray-600">{error || 'Este convite não está mais disponível.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-4xl px-4">
        <button onClick={() => navigate('/')} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-dark">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao site
        </button>

        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {step === 'confirm' && (
            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Convite exclusivo</p>
              <h1 className="text-3xl font-bold text-gray-950">Sua vaga foi liberada</h1>
              <p className="text-gray-600">
                Uma vaga em <strong>{enrollment.product?.name}</strong> foi reservada exclusivamente para você até{' '}
                <strong>{enrollment.reservation_expires_at ? new Date(enrollment.reservation_expires_at).toLocaleString('pt-BR') : '-'}</strong>.
              </p>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-700">
                Quer acompanhar sua inscrição depois pela sua conta?{' '}
                <a href={createPasswordLink} className="font-semibold text-dark underline-offset-2 hover:underline">
                  Criar senha
                </a>
              </div>
              <button onClick={() => setStep('review')} className="rounded-2xl bg-dark px-6 py-4 font-semibold text-white">
                Continuar inscrição
              </button>
            </div>
          )}

          {step === 'review' && (
            <form onSubmit={handleSaveReview} className="space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Revisão</p>
                <h1 className="mt-2 text-3xl font-bold text-gray-950">Revise seus dados</h1>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Nome completo</label>
                  <input className={baseInputClass} value={formData.nome_completo || ''} onChange={(event) => setFormData((current) => ({ ...current, nome_completo: event.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                  <input type="email" className={baseInputClass} value={formData.email || ''} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} />
                </div>
                {getFieldConfig('telefone').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Telefone</label>
                    <input className={baseInputClass} value={formData.telefone || ''} onChange={(event) => setFormData((current) => ({ ...current, telefone: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('data_nascimento').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Data de nascimento</label>
                    <input type="date" className={baseInputClass} value={formData.data_nascimento || ''} onChange={(event) => setFormData((current) => ({ ...current, data_nascimento: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('sexo').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Sexo</label>
                    <select className={baseInputClass} value={formData.sexo || ''} onChange={(event) => setFormData((current) => ({ ...current, sexo: event.target.value }))}>
                      <option value="">Selecione</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                    </select>
                  </div>
                )}
                {getFieldConfig('cpf').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">CPF</label>
                    <input className={baseInputClass} value={formData.cpf || ''} onChange={(event) => setFormData((current) => ({ ...current, cpf: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('rg').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">RG</label>
                    <input className={baseInputClass} value={formData.rg || ''} onChange={(event) => setFormData((current) => ({ ...current, rg: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('cep').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">CEP</label>
                    <input className={baseInputClass} value={formData.cep || ''} onChange={(event) => setFormData((current) => ({ ...current, cep: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('tamanho_camiseta').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Tamanho da camiseta</label>
                    <input className={baseInputClass} value={formData.tamanho_camiseta || ''} onChange={(event) => setFormData((current) => ({ ...current, tamanho_camiseta: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('membro_batista_capital').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Membro Batista Capital?</label>
                    <select className={baseInputClass} value={formData.membro_batista_capital || ''} onChange={(event) => setFormData((current) => ({ ...current, membro_batista_capital: event.target.value }))}>
                      <option value="">Selecione</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                )}
                {getFieldConfig('igreja').enabled && formData.membro_batista_capital === 'nao' && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Igreja</label>
                    <input className={baseInputClass} value={formData.igreja || ''} onChange={(event) => setFormData((current) => ({ ...current, igreja: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('lider_pg').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Líder de PG</label>
                    <input className={baseInputClass} value={formData.lider_pg || ''} onChange={(event) => setFormData((current) => ({ ...current, lider_pg: event.target.value }))} />
                  </div>
                )}
                {getFieldConfig('ja_participou_zion').enabled && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Já participou do ZION?</label>
                    <select
                      className={baseInputClass}
                      value={formData.ja_participou_zion || ''}
                      onChange={(event) => setFormData((current) => ({
                        ...current,
                        ja_participou_zion: event.target.value,
                        imperio_zion: event.target.value === 'sim' ? current.imperio_zion : '',
                      }))}
                    >
                      <option value="">Selecione</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                )}
                {getFieldConfig('imperio_zion').enabled && formData.ja_participou_zion === 'sim' && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Império</label>
                    <select className={baseInputClass} value={formData.imperio_zion || ''} onChange={(event) => setFormData((current) => ({ ...current, imperio_zion: event.target.value }))}>
                      <option value="">Selecione</option>
                      <option value="egito">Egito</option>
                      <option value="persia">Pérsia</option>
                      <option value="grecia">Grécia</option>
                      <option value="roma">Roma</option>
                    </select>
                  </div>
                )}
              </div>

              {getFieldConfig('observacoes').enabled && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Observações</label>
                  <textarea rows={4} className={baseInputClass} value={formData.observacoes || ''} onChange={(event) => setFormData((current) => ({ ...current, observacoes: event.target.value }))} />
                </div>
              )}

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <h2 className="text-xl font-semibold text-gray-950">Responsável</h2>
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Nome do responsável</label>
                    <input className={baseInputClass} value={responsibleFormData.nome_responsavel || ''} onChange={(event) => setResponsibleFormData((current) => ({ ...current, nome_responsavel: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Email do responsável</label>
                    <input type="email" className={baseInputClass} value={responsibleFormData.email_responsavel || ''} onChange={(event) => setResponsibleFormData((current) => ({ ...current, email_responsavel: event.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Telefone do responsável</label>
                    <input className={baseInputClass} value={responsibleFormData.telefone_responsavel || ''} onChange={(event) => setResponsibleFormData((current) => ({ ...current, telefone_responsavel: event.target.value }))} />
                  </div>
                  {responsibleExtraFields.map((field) => (
                    <div key={field.key} className={field.type === 'checkbox' ? 'md:col-span-2' : ''}>
                      {field.type !== 'checkbox' && <label className="mb-2 block text-sm font-medium text-gray-700">{field.label}</label>}
                      {renderResponsibleField(field)}
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={saving} className="rounded-2xl bg-dark px-6 py-4 font-semibold text-white">
                {saving ? 'Salvando...' : 'Salvar e continuar'}
              </button>
            </form>
          )}

          {step === 'payment' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Pagamento</p>
                <h1 className="mt-2 text-3xl font-bold text-gray-950">Escolha a forma de pagamento</h1>
              </div>
              {!payment ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    {enablePixCash && (
                      <button type="button" onClick={() => { setPaymentMethod('PIX_CASH'); setInstallments(1); }} className={`rounded-2xl border p-5 text-left ${paymentMethod === 'PIX_CASH' ? 'border-dark bg-gray-50' : 'border-gray-200'}`}>
                        <div className="text-lg font-semibold text-gray-950">PIX à vista</div>
                        <div className="mt-2 text-sm text-gray-600">R$ {pricing.pixCash.toFixed(2)}</div>
                      </button>
                    )}
                    {enablePixInstallment && (
                      <button type="button" onClick={() => { setPaymentMethod('PIX_INSTALLMENT'); if (installments < 2) setInstallments(2); }} className={`rounded-2xl border p-5 text-left ${paymentMethod === 'PIX_INSTALLMENT' ? 'border-dark bg-gray-50' : 'border-gray-200'}`}>
                        <div className="text-lg font-semibold text-gray-950">PIX parcelado</div>
                        <div className="mt-2 text-sm text-gray-600">R$ {pricing.pixInstallment.toFixed(2)}</div>
                      </button>
                    )}
                    {enableCreditCard && (
                      <button type="button" onClick={() => setPaymentMethod('CREDIT_CARD')} className={`rounded-2xl border p-5 text-left ${paymentMethod === 'CREDIT_CARD' ? 'border-dark bg-gray-50' : 'border-gray-200'}`}>
                        <div className="text-lg font-semibold text-gray-950">Cartão</div>
                        <div className="mt-2 text-sm text-gray-600">R$ {pricing.creditCard.toFixed(2)}</div>
                      </button>
                    )}
                  </div>
                  {(paymentMethod === 'PIX_INSTALLMENT' || paymentMethod === 'CREDIT_CARD') && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Parcelas</label>
                      <select value={installments} onChange={(event) => setInstallments(Number(event.target.value))} className={baseInputClass}>
                        {Array.from({ length: enrollment.max_installments || 6 }, (_, index) => index + 1)
                          .filter((value) => paymentMethod === 'PIX_INSTALLMENT' ? value >= 2 : true)
                          .map((value) => (
                            <option key={value} value={value}>{value}x</option>
                          ))}
                      </select>
                    </div>
                  )}
                  <button type="button" onClick={handleCreatePayment} disabled={saving} className="rounded-2xl bg-dark px-6 py-4 font-semibold text-white">
                    {saving ? 'Criando pagamento...' : paymentMethod === 'CREDIT_CARD' ? 'Ir para o pagamento' : 'Gerar cobrança'}
                  </button>
                </>
              ) : (
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Check className="h-5 w-5" />
                    Cobrança criada com sucesso
                  </div>
                  {payment.payment_url && !payment.pix_qr_code && (
                    <a href={payment.payment_url} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-dark px-5 py-3 text-sm font-semibold text-white">
                      Abrir cobrança
                    </a>
                  )}
                  {payment.pix_qr_code && (
                    <img src={`data:image/png;base64,${payment.pix_qr_code}`} alt="QR Code PIX" className="mx-auto w-full max-w-xs rounded-2xl border border-gray-200 bg-white p-3" />
                  )}
                  {payment.pix_copy_paste && (
                    <div className="space-y-3">
                      <textarea readOnly value={payment.pix_copy_paste} className={`${baseInputClass} min-h-[120px]`} />
                      <button type="button" onClick={copyPixCode} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
                        <Copy className="h-4 w-4" />
                        {copied ? 'Código copiado' : 'Copiar código PIX'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
