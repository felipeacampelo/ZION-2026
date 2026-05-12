import { useEffect, useState } from 'react';
import { Loader2, Mail, Save, Send } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminEmailCampaign,
  getAdminEmailCampaign,
  getAdminEmailCampaigns,
  getAdminEmailTemplates,
  getAdminProducts,
  previewAdminEmailCampaignRecipients,
  previewAdminEmailCampaignRecipientsByFilters,
  previewAdminEmailTemplate,
  sendAdminEmailCampaign,
  sendAdminEmailCampaignDraftTest,
  sendAdminEmailCampaignTest,
  sendAdminEmailTemplateTest,
  updateAdminEmailCampaign,
  updateAdminEmailTemplate,
  type EmailCampaign,
  type EmailTemplate,
  type Product,
} from '../services/api';

type CampaignForm = {
  id?: number;
  name: string;
  subject: string;
  html_content: string;
  text_content: string;
  filters: {
    product?: number;
    status?: string;
    payment_method?: string;
    search?: string;
  };
  status?: EmailCampaign['status'];
};

const emptyCampaignForm: CampaignForm = {
  name: '',
  subject: '',
  html_content: '',
  text_content: '',
  filters: {},
  status: 'DRAFT',
};

function getApiErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data === 'string') return data;

  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (typeof value === 'string') return value;
  }

  return fallback;
}

export default function AdminEmailSettings() {
  const [activeTab, setActiveTab] = useState<'templates' | 'campaigns'>('templates');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('enrollment_confirmation');
  const [templateForm, setTemplateForm] = useState<EmailTemplate | null>(null);
  const [templateTestEmail, setTemplateTestEmail] = useState('');
  const [templatePreview, setTemplatePreview] = useState<{
    subject: string;
    html_content: string;
    text_content: string;
  } | null>(null);

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(emptyCampaignForm);
  const [campaignTestEmail, setCampaignTestEmail] = useState('');
  const [recipientPreview, setRecipientPreview] = useState<{
    count: number;
    sample: Array<{ enrollment_id: number; email: string; name: string }>;
  } | null>(null);

  const loadData = async () => {
    try {
      const [templatesRes, campaignsRes, productsRes] = await Promise.all([
        getAdminEmailTemplates(),
        getAdminEmailCampaigns(),
        getAdminProducts(),
      ]);

      setTemplates(templatesRes.data);
      setCampaigns(campaignsRes.data);
      setProducts(productsRes.data);

      const initialTemplate = templatesRes.data.find((item) => item.key === selectedTemplateKey) || templatesRes.data[0] || null;
      if (initialTemplate) {
        setSelectedTemplateKey(initialTemplate.key);
        setTemplateForm(initialTemplate);
      }
    } catch {
      setError('Erro ao carregar configuração de emails.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!selectedTemplateKey || templates.length === 0) return;
    const match = templates.find((item) => item.key === selectedTemplateKey);
    if (match) {
      setTemplateForm(match);
      setTemplatePreview(null);
    }
  }, [selectedTemplateKey, templates]);

  const refreshCampaign = async (campaignId: number) => {
    const response = await getAdminEmailCampaign(campaignId);
    const campaign = response.data;
    setCampaigns((current) => {
      const others = current.filter((item) => item.id !== campaign.id);
      return [campaign, ...others].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    setSelectedCampaignId(campaign.id);
    setCampaignForm({
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      html_content: campaign.html_content,
      text_content: campaign.text_content,
      filters: campaign.filters || {},
      status: campaign.status,
    });
    return campaign;
  };

  const handleSaveTemplate = async () => {
    if (!templateForm) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateAdminEmailTemplate(templateForm.key, {
        subject: templateForm.subject,
        html_content: templateForm.html_content,
        text_content: templateForm.text_content,
        is_active: templateForm.is_active,
      });
      const updated = response.data;
      setTemplates((current) => current.map((item) => (item.key === updated.key ? updated : item)));
      setTemplateForm(updated);
      setSuccess('Template salvo com sucesso.');
    } catch {
      setError('Erro ao salvar template.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewTemplate = async () => {
    if (!templateForm) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateAdminEmailTemplate(templateForm.key, {
        subject: templateForm.subject,
        html_content: templateForm.html_content,
        text_content: templateForm.text_content,
        is_active: templateForm.is_active,
      });
      const previewResponse = await previewAdminEmailTemplate(templateForm.key);
      setTemplatePreview(previewResponse.data);
    } catch {
      setError('Erro ao gerar preview do template.');
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateTest = async () => {
    if (!templateForm || !templateTestEmail) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateAdminEmailTemplate(templateForm.key, {
        subject: templateForm.subject,
        html_content: templateForm.html_content,
        text_content: templateForm.text_content,
        is_active: templateForm.is_active,
      });
      await sendAdminEmailTemplateTest(templateForm.key, templateTestEmail);
      setSuccess('Email de teste enviado com sucesso.');
    } catch {
      setError('Erro ao enviar email de teste do template.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDraft = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await createAdminEmailCampaign(campaignForm);
      await loadData();
      await refreshCampaign(response.data.id);
      setSuccess('Campanha criada como rascunho.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Erro ao criar campanha.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!campaignForm.id) {
      await handleCreateDraft();
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateAdminEmailCampaign(campaignForm.id, {
        name: campaignForm.name,
        subject: campaignForm.subject,
        html_content: campaignForm.html_content,
        text_content: campaignForm.text_content,
        filters: campaignForm.filters,
      });
      await loadData();
      await refreshCampaign(response.data.id);
      setSuccess('Rascunho atualizado com sucesso.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Erro ao salvar rascunho.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewRecipients = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (!campaignForm.id) {
        const response = await previewAdminEmailCampaignRecipientsByFilters(campaignForm.filters);
        setRecipientPreview(response.data);
      } else {
        await updateAdminEmailCampaign(campaignForm.id, {
          name: campaignForm.name,
          subject: campaignForm.subject,
          html_content: campaignForm.html_content,
          text_content: campaignForm.text_content,
          filters: campaignForm.filters,
        });
        const response = await previewAdminEmailCampaignRecipients(campaignForm.id);
        setRecipientPreview(response.data);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Erro ao calcular destinatários.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCampaignTest = async () => {
    if (!campaignTestEmail) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (!campaignForm.id) {
        await sendAdminEmailCampaignDraftTest({
          to_email: campaignTestEmail,
          subject: campaignForm.subject,
          html_content: campaignForm.html_content,
          text_content: campaignForm.text_content,
          filters: campaignForm.filters,
        });
      } else {
        await updateAdminEmailCampaign(campaignForm.id, {
          name: campaignForm.name,
          subject: campaignForm.subject,
          html_content: campaignForm.html_content,
          text_content: campaignForm.text_content,
          filters: campaignForm.filters,
        });
        await sendAdminEmailCampaignTest(campaignForm.id, campaignTestEmail);
      }
      setSuccess('Email de teste da campanha enviado com sucesso.');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Erro ao enviar teste da campanha.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendCampaign = async () => {
    if (!campaignForm.id) {
      setError('Salve a campanha antes de confirmar o envio.');
      return;
    }

    const confirmed = window.confirm('Confirma o disparo desta campanha para todos os destinatários do snapshot?');
    if (!confirmed) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await updateAdminEmailCampaign(campaignForm.id, {
        name: campaignForm.name,
        subject: campaignForm.subject,
        html_content: campaignForm.html_content,
        text_content: campaignForm.text_content,
        filters: campaignForm.filters,
      });
      const response = await sendAdminEmailCampaign(campaignForm.id);
      await loadData();
      await refreshCampaign(campaignForm.id);
      setSuccess(`Envio iniciado para ${response.data.recipient_count} destinatário(s).`);
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Erro ao iniciar campanha.'));
    } finally {
      setSaving(false);
    }
  };

  const applyTemplateToCampaign = (key: string) => {
    const template = templates.find((item) => item.key === key);
    if (!template) return;
    setCampaignForm((current) => ({
      ...current,
      subject: template.subject,
      html_content: template.html_content,
      text_content: template.text_content,
    }));
    setSuccess(`Template "${template.name}" aplicado na campanha.`);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Emails</h2>
          <p className="mt-2 text-sm text-gray-600">Edite templates automáticos e gerencie campanhas em lote com Resend.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'templates' ? 'bg-purple/10 text-purple' : 'bg-white text-gray-700'}`}
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('campaigns')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${activeTab === 'campaigns' ? 'bg-purple/10 text-purple' : 'bg-white text-gray-700'}`}
          >
            Campanhas
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando emails...
            </div>
          </div>
        ) : activeTab === 'templates' ? (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="rounded-2xl bg-white p-4 shadow-lg">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Templates atuais</h3>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => setSelectedTemplateKey(template.key)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${selectedTemplateKey === template.key ? 'border-purple bg-purple/5' : 'border-gray-200'}`}
                  >
                    <p className="font-medium text-gray-900">{template.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {templateForm && (
              <div className="space-y-6 rounded-2xl bg-white p-6 shadow-lg">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4">
                      <div>
                        <p className="font-medium text-gray-900">Template ativo</p>
                        <p className="text-sm text-gray-600">Quando desativado, o disparo automático desse email é ignorado.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTemplateForm({ ...templateForm, is_active: !templateForm.is_active })}
                        className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${templateForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`h-5 w-5 rounded-full bg-white transition-transform ${templateForm.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Assunto</label>
                      <input
                        value={templateForm.subject}
                        onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">HTML</label>
                      <textarea
                        value={templateForm.html_content}
                        onChange={(e) => setTemplateForm({ ...templateForm, html_content: e.target.value })}
                        rows={16}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Texto fallback</label>
                      <textarea
                        value={templateForm.text_content}
                        onChange={(e) => setTemplateForm({ ...templateForm, text_content: e.target.value })}
                        rows={6}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400"
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleSaveTemplate()}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: 'rgb(165, 44, 240)' }}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar template
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePreviewTemplate()}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-60"
                      >
                        <Mail className="h-4 w-4" />
                        Gerar preview
                      </button>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="mb-3 text-sm font-medium text-gray-900">Enviar teste</p>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          type="email"
                          value={templateTestEmail}
                          onChange={(e) => setTemplateTestEmail(e.target.value)}
                          placeholder="destino@exemplo.com"
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => void handleTemplateTest()}
                          disabled={saving || !templateTestEmail}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-60"
                        >
                          <Send className="h-4 w-4" />
                          Enviar teste
                        </button>
                      </div>
                    </div>

                    {templatePreview && (
                      <div className="rounded-xl border border-gray-200 p-4">
                        <p className="text-sm font-medium text-gray-900">Preview renderizado</p>
                        <p className="mt-2 text-sm text-gray-600"><strong>Assunto:</strong> {templatePreview.subject}</p>
                        <div
                          className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                          dangerouslySetInnerHTML={{ __html: templatePreview.html_content }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-900">Tokens disponíveis</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {templateForm.available_tokens.map((token) => (
                        <span key={token} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700">
                          {`{{ ${token} }}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl bg-white p-6 shadow-lg">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Rascunho da campanha</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCampaignForm(emptyCampaignForm)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
                      >
                        Nova campanha
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveDraft()}
                        disabled={saving}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: 'rgb(165, 44, 240)' }}
                      >
                        {campaignForm.id ? 'Salvar rascunho' : 'Criar rascunho'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Usar template existente</label>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) applyTemplateToCampaign(e.target.value);
                      }}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                    >
                      <option value="">Selecione um template</option>
                      {templates.map((template) => (
                        <option key={template.key} value={template.key}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Nome interno</label>
                    <input
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Assunto</label>
                    <input
                      value={campaignForm.subject}
                      onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">HTML</label>
                    <textarea
                      value={campaignForm.html_content}
                      onChange={(e) => setCampaignForm({ ...campaignForm, html_content: e.target.value })}
                      rows={12}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Texto fallback</label>
                    <textarea
                      value={campaignForm.text_content}
                      onChange={(e) => setCampaignForm({ ...campaignForm, text_content: e.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="mb-4 text-sm font-semibold text-gray-900">Filtros de público</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <select
                        value={campaignForm.filters.product || ''}
                        onChange={(e) =>
                          setCampaignForm({
                            ...campaignForm,
                            filters: {
                              ...campaignForm.filters,
                              product: e.target.value ? Number(e.target.value) : undefined,
                            },
                          })
                        }
                        className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                      >
                        <option value="">Todos os produtos</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={campaignForm.filters.status || ''}
                        onChange={(e) =>
                          setCampaignForm({
                            ...campaignForm,
                            filters: {
                              ...campaignForm.filters,
                              status: e.target.value || undefined,
                            },
                          })
                        }
                        className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                      >
                        <option value="">Todos os status</option>
                        <option value="PENDING_PAYMENT">Aguardando pagamento</option>
                        <option value="PAID">Pago</option>
                        <option value="CANCELLED">Cancelado</option>
                        <option value="EXPIRED">Expirado</option>
                      </select>

                      <select
                        value={campaignForm.filters.payment_method || ''}
                        onChange={(e) =>
                          setCampaignForm({
                            ...campaignForm,
                            filters: {
                              ...campaignForm.filters,
                              payment_method: e.target.value || undefined,
                            },
                          })
                        }
                        className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900"
                      >
                        <option value="">Todas as formas de pagamento</option>
                        <option value="PIX_CASH">PIX à vista</option>
                        <option value="PIX_INSTALLMENT">PIX parcelado</option>
                        <option value="CREDIT_CARD">Cartão de crédito</option>
                      </select>

                      <input
                        value={campaignForm.filters.search || ''}
                        onChange={(e) =>
                          setCampaignForm({
                            ...campaignForm,
                            filters: {
                              ...campaignForm.filters,
                              search: e.target.value || undefined,
                            },
                          })
                        }
                        placeholder="Buscar por nome, email ou CPF"
                        className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePreviewRecipients()}
                      disabled={saving}
                      className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-60"
                    >
                      Prévia de destinatários
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSendCampaign()}
                      disabled={saving || campaignForm.status === 'SENDING' || campaignForm.status === 'SENT'}
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: 'rgb(165, 44, 240)' }}
                    >
                      <Send className="h-4 w-4" />
                      Confirmar envio
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="mb-3 text-sm font-medium text-gray-900">Enviar teste</p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="email"
                        value={campaignTestEmail}
                        onChange={(e) => setCampaignTestEmail(e.target.value)}
                        placeholder="destino@exemplo.com"
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCampaignTest()}
                        disabled={saving || !campaignTestEmail}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        Enviar teste
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl bg-white p-6 shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-900">Prévia de destinatários</h3>
                  {recipientPreview ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm text-gray-700">Total estimado: <strong>{recipientPreview.count}</strong></p>
                      <div className="space-y-2">
                        {recipientPreview.sample.map((recipient) => (
                          <div key={`${recipient.enrollment_id}-${recipient.email}`} className="rounded-lg border border-gray-200 px-3 py-2">
                            <p className="text-sm font-medium text-gray-900">{recipient.name}</p>
                            <p className="text-xs text-gray-500">{recipient.email}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-gray-600">Gere a prévia para ver quantidade e amostra do público.</p>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-6 shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-900">Campanhas existentes</h3>
                  <div className="mt-4 space-y-3">
                    {campaigns.map((campaign) => (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => void refreshCampaign(campaign.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left ${selectedCampaignId === campaign.id ? 'border-purple bg-purple/5' : 'border-gray-200'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{campaign.name}</p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            {campaign.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                          {campaign.sent_count}/{campaign.recipient_count} enviados • {campaign.failed_count} falhas
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedCampaignId && (
                  <div className="rounded-2xl bg-white p-6 shadow-lg">
                    <h3 className="text-lg font-semibold text-gray-900">Detalhe da campanha</h3>
                    <div className="mt-4 space-y-3">
                      {campaigns.find((item) => item.id === selectedCampaignId)?.recipients?.filter((item) => item.status === 'FAILED').length ? (
                        campaigns
                          .find((item) => item.id === selectedCampaignId)
                          ?.recipients.filter((item) => item.status === 'FAILED')
                          .map((recipient) => (
                            <div key={recipient.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                              <p className="text-sm font-medium text-red-800">{recipient.email}</p>
                              <p className="text-xs text-red-700">{recipient.error_message || 'Falha no envio.'}</p>
                            </div>
                          ))
                      ) : (
                        <p className="text-sm text-gray-600">As falhas por destinatário aparecerão aqui após o envio.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
