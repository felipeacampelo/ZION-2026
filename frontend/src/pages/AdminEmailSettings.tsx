import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Loader2, Mail, Save, Send, TriangleAlert } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminEmailCampaign,
  getAdminEmailCampaign,
  getAdminEmailCampaigns,
  getAdminEnrollments,
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
  type Enrollment,
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
    payment_state?: string;
    search?: string;
    enrollment_ids?: number[];
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

const CAMPAIGN_STATUS: Record<string, { label: string; className: string }> = {
  DRAFT:   { label: 'Rascunho', className: 'bg-slate-100 text-slate-700' },
  SENDING: { label: 'Enviando', className: 'bg-amber-100 text-amber-800' },
  SENT:    { label: 'Enviada',  className: 'bg-green-100 text-green-800' },
  FAILED:  { label: 'Com falhas', className: 'bg-red-100 text-red-800' },
};

const cardClass = 'rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:p-6';
const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-400';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';

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

  // — Templates —
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

  // — Campaigns —
  const [campaignView, setCampaignView] = useState<'list' | 'editor'>('list');
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(emptyCampaignForm);
  const [campaignTemplateKey, setCampaignTemplateKey] = useState('');
  const [campaignTestEmail, setCampaignTestEmail] = useState('');
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [recipientPreview, setRecipientPreview] = useState<{
    count: number;
    sample: Array<{ enrollment_id: number; email: string; name: string }>;
  } | null>(null);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientOptions, setRecipientOptions] = useState<Enrollment[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Enrollment[]>([]);
  const [searchingRecipients, setSearchingRecipients] = useState(false);

  const selectedCampaign = campaigns.find((item) => item.id === selectedCampaignId) || null;
  const failedRecipients = selectedCampaign?.recipients?.filter((item) => item.status === 'FAILED') || [];

  const loadData = async () => {
    setError('');
    const [templatesRes, campaignsRes, productsRes] = await Promise.allSettled([
      getAdminEmailTemplates(),
      getAdminEmailCampaigns(),
      getAdminProducts(),
    ]);

    const loadErrors: string[] = [];

    if (templatesRes.status === 'fulfilled') {
      setTemplates(templatesRes.value.data);
      const initialTemplate =
        templatesRes.value.data.find((item) => item.key === selectedTemplateKey) ||
        templatesRes.value.data[0] ||
        null;
      if (initialTemplate) {
        setSelectedTemplateKey(initialTemplate.key);
        setTemplateForm(initialTemplate);
      }
    } else {
      loadErrors.push('templates');
    }

    if (campaignsRes.status === 'fulfilled') {
      setCampaigns(campaignsRes.value.data);
    } else {
      loadErrors.push('campanhas');
    }

    if (productsRes.status === 'fulfilled') {
      setProducts(productsRes.value.data);
    } else {
      loadErrors.push('produtos');
    }

    if (loadErrors.length > 0) {
      setError(
        loadErrors.length === 3
          ? 'Erro ao carregar configuração de emails.'
          : `Erro ao carregar ${loadErrors.join(', ')} de emails.`,
      );
    }

    setLoading(false);
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

  useEffect(() => {
    if (activeTab !== 'campaigns') return;
    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchingRecipients(true);
        const response = await getAdminEnrollments({
          search: recipientSearch.trim() || undefined,
          page: 1,
          page_size: 20,
        });
        const results = Array.isArray(response.data) ? response.data : response.data.results || [];
        setRecipientOptions(results);
      } catch (err) {
        console.error('Erro ao buscar inscritos para campanha:', err);
      } finally {
        setSearchingRecipients(false);
      }
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, recipientSearch]);

  useEffect(() => {
    const selectedIds = campaignForm.filters.enrollment_ids || [];
    if (selectedIds.length === 0) {
      setSelectedRecipients([]);
      return;
    }
    const currentIds = selectedRecipients.map((r) => r.id).sort((a, b) => a - b);
    const normalizedIds = [...selectedIds].sort((a, b) => a - b);
    if (
      currentIds.length === normalizedIds.length &&
      currentIds.every((id, i) => id === normalizedIds[i])
    ) return;

    const loadSelectedRecipients = async () => {
      try {
        const response = await getAdminEnrollments({
          ids: selectedIds,
          page: 1,
          page_size: selectedIds.length,
        });
        const results = Array.isArray(response.data) ? response.data : response.data.results || [];
        setSelectedRecipients(results);
      } catch (err) {
        console.error('Erro ao carregar inscritos selecionados da campanha:', err);
      }
    };
    void loadSelectedRecipients();
  }, [campaignForm.filters.enrollment_ids, selectedRecipients]);

  const refreshCampaign = async (campaignId: number) => {
    const response = await getAdminEmailCampaign(campaignId);
    const campaign = response.data;
    setCampaigns((current) => {
      const others = current.filter((item) => item.id !== campaign.id);
      return [campaign, ...others].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
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

  const openCampaignEditor = async (campaignId: number) => {
    await refreshCampaign(campaignId);
    setCampaignTemplateKey('');
    setRecipientPreview(null);
    setShowSendConfirm(false);
    setCampaignView('editor');
  };

  const openNewCampaign = () => {
    setCampaignForm(emptyCampaignForm);
    setSelectedCampaignId(null);
    setCampaignTemplateKey('');
    setRecipientPreview(null);
    setShowSendConfirm(false);
    setSelectedRecipients([]);
    setCampaignView('editor');
  };

  const addRecipientToCampaign = (enrollment: Enrollment) => {
    const currentIds = campaignForm.filters.enrollment_ids || [];
    if (currentIds.includes(enrollment.id)) return;
    setCampaignForm((current) => ({
      ...current,
      filters: { ...current.filters, enrollment_ids: [...currentIds, enrollment.id] },
    }));
    setSelectedRecipients((current) => [...current, enrollment]);
  };

  const removeRecipientFromCampaign = (enrollmentId: number) => {
    setCampaignForm((current) => {
      const nextIds = (current.filters.enrollment_ids || []).filter((id) => id !== enrollmentId);
      return {
        ...current,
        filters: {
          ...current.filters,
          enrollment_ids: nextIds.length > 0 ? nextIds : undefined,
        },
      };
    });
    setSelectedRecipients((current) => current.filter((r) => r.id !== enrollmentId));
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
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      setShowSendConfirm(false);
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
    setSuccess(`Template "${template.name}" aplicado.`);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Emails</h2>
          <p className="mt-2 text-sm text-gray-600">
            Edite templates automáticos e gerencie campanhas em lote com Resend.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
          {(['templates', 'campaigns'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'templates' ? 'Templates' : 'Campanhas'}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {loading ? (
          <div className={cardClass}>
            <div className="flex items-center gap-3 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando emails...
            </div>
          </div>
        ) : activeTab === 'templates' ? (

          /* ─────────────── TEMPLATES TAB ─────────────── */
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* Template list */}
            <div className={cardClass}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-gray-500">
                Templates
              </h3>
              <div className="space-y-1.5">
                {templates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => setSelectedTemplateKey(template.key)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                      selectedTemplateKey === template.key
                        ? 'border-purple/30 bg-purple/5'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{template.name}</p>
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${
                        template.is_active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      title={template.is_active ? 'Ativo' : 'Inativo'}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Template editor */}
            {templateForm && (
              <div className="space-y-5">
                <div className={cardClass}>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="space-y-4">
                      {/* Active toggle */}
                      <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Template ativo</p>
                          <p className="text-xs text-gray-500">
                            Desativado, o disparo automático desse email é ignorado.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTemplateForm({ ...templateForm, is_active: !templateForm.is_active })
                          }
                          className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${
                            templateForm.is_active ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-white transition-transform ${
                              templateForm.is_active ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div>
                        <label className={labelClass}>Assunto</label>
                        <input
                          value={templateForm.subject}
                          onChange={(e) =>
                            setTemplateForm({ ...templateForm, subject: e.target.value })
                          }
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>HTML</label>
                        <textarea
                          value={templateForm.html_content}
                          onChange={(e) =>
                            setTemplateForm({ ...templateForm, html_content: e.target.value })
                          }
                          rows={16}
                          className={`${inputClass} font-mono text-xs`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Texto fallback</label>
                        <textarea
                          value={templateForm.text_content}
                          onChange={(e) =>
                            setTemplateForm({ ...templateForm, text_content: e.target.value })
                          }
                          rows={5}
                          className={`${inputClass} font-mono text-xs`}
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleSaveTemplate()}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Salvar template
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePreviewTemplate()}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                        >
                          <Mail className="h-4 w-4" />
                          Salvar e pré-visualizar
                        </button>
                      </div>

                      {/* Test send */}
                      <div className="rounded-xl border border-gray-200 p-4">
                        <p className={labelClass}>Enviar teste</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="email"
                            value={templateTestEmail}
                            onChange={(e) => setTemplateTestEmail(e.target.value)}
                            placeholder="destino@exemplo.com"
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={() => void handleTemplateTest()}
                            disabled={saving || !templateTestEmail}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                          >
                            <Send className="h-4 w-4" />
                            Enviar teste
                          </button>
                        </div>
                      </div>

                      {templatePreview && (
                        <div className="rounded-xl border border-gray-200 p-4">
                          <p className="mb-1 text-sm font-medium text-gray-900">
                            Preview renderizado
                          </p>
                          <p className="mb-4 text-sm text-gray-600">
                            <strong>Assunto:</strong> {templatePreview.subject}
                          </p>
                          <div
                            className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                            dangerouslySetInnerHTML={{ __html: templatePreview.html_content }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Available tokens */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">
                        Tokens disponíveis
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {templateForm.available_tokens.map((token) => (
                          <span
                            key={token}
                            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
                          >
                            {`{{ ${token} }}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        ) : (

          /* ─────────────── CAMPAIGNS TAB ─────────────── */
          campaignView === 'list' ? (

            /* LIST VIEW */
            <div className={cardClass}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Campanhas</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Clique em uma campanha para editar ou ver o status de envio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewCampaign}
                  className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  + Nova campanha
                </button>
              </div>

              <div className="mt-5 space-y-2">
                {campaigns.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-gray-500">
                    Nenhuma campanha criada ainda.
                  </div>
                ) : (
                  campaigns.map((campaign) => {
                    const statusMeta = CAMPAIGN_STATUS[campaign.status] ?? {
                      label: campaign.status,
                      className: 'bg-gray-100 text-gray-700',
                    };
                    return (
                      <button
                        key={campaign.id}
                        type="button"
                        onClick={() => void openCampaignEditor(campaign.id)}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {campaign.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {campaign.sent_count}/{campaign.recipient_count} enviados
                            {campaign.failed_count > 0 && (
                              <span className="ml-1.5 text-red-600">
                                · {campaign.failed_count} falhas
                              </span>
                            )}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

          ) : (

            /* EDITOR VIEW */
            <div className="space-y-5">
              {/* Editor header */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setCampaignView('list'); setError(''); setSuccess(''); }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Campanhas
                </button>
                <h3 className="text-lg font-semibold text-gray-900">
                  {campaignForm.id ? campaignForm.name || 'Sem nome' : 'Nova campanha'}
                </h3>
                {campaignForm.status && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      (CAMPAIGN_STATUS[campaignForm.status] ?? { className: 'bg-gray-100 text-gray-700' }).className
                    }`}
                  >
                    {(CAMPAIGN_STATUS[campaignForm.status] ?? { label: campaignForm.status }).label}
                  </span>
                )}
              </div>

              {/* Section 1: Conteúdo */}
              <section className={cardClass}>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  1. Conteúdo
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Usar template base</label>
                    <select
                      value={campaignTemplateKey}
                      onChange={(e) => {
                        setCampaignTemplateKey(e.target.value);
                        if (e.target.value) applyTemplateToCampaign(e.target.value);
                      }}
                      className={inputClass}
                    >
                      <option value="">Nenhum — escrever do zero</option>
                      {templates.map((template) => (
                        <option key={template.key} value={template.key}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Nome interno</label>
                    <input
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                      placeholder="Ex: Lembrete de pagamento — Lote 2"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Assunto</label>
                    <input
                      value={campaignForm.subject}
                      onChange={(e) =>
                        setCampaignForm({ ...campaignForm, subject: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>HTML</label>
                    <textarea
                      value={campaignForm.html_content}
                      onChange={(e) =>
                        setCampaignForm({ ...campaignForm, html_content: e.target.value })
                      }
                      rows={14}
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Texto fallback</label>
                    <textarea
                      value={campaignForm.text_content}
                      onChange={(e) =>
                        setCampaignForm({ ...campaignForm, text_content: e.target.value })
                      }
                      rows={5}
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>
                </div>
              </section>

              {/* Section 2: Público */}
              <section className={cardClass}>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  2. Público
                </h4>

                <div className="space-y-4">
                  <p className="text-sm font-medium text-gray-700">Filtros</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                      className={inputClass}
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
                          filters: { ...campaignForm.filters, status: e.target.value || undefined },
                        })
                      }
                      className={inputClass}
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
                      className={inputClass}
                    >
                      <option value="">Todas as formas de pagamento</option>
                      <option value="PIX_CASH">PIX à vista</option>
                      <option value="PIX_INSTALLMENT">PIX parcelado</option>
                      <option value="CREDIT_CARD">Cartão de crédito</option>
                    </select>

                    <select
                      value={campaignForm.filters.payment_state || ''}
                      onChange={(e) =>
                        setCampaignForm({
                          ...campaignForm,
                          filters: {
                            ...campaignForm.filters,
                            payment_state: e.target.value || undefined,
                          },
                        })
                      }
                      className={inputClass}
                    >
                      <option value="">Qualquer situação de pagamento</option>
                      <option value="NO_PAYMENT_YET">Sem pagamento efetivado</option>
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
                      className={inputClass}
                    />
                  </div>

                  {/* Specific recipients */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-sm font-medium text-gray-700">
                      Inscritos específicos{' '}
                      <span className="font-normal text-gray-500">(opcional)</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Quando preenchido, a campanha é restrita a esses inscritos (em conjunto com os filtros acima).
                    </p>

                    <input
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="Buscar inscrito por nome, email ou CPF"
                      className={`${inputClass} mt-3`}
                    />

                    <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                      {searchingRecipients ? (
                        <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Buscando inscritos...
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto">
                          {recipientOptions.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              Nenhum inscrito encontrado.
                            </div>
                          ) : (
                            recipientOptions.map((enrollment) => {
                              const isSelected = (
                                campaignForm.filters.enrollment_ids || []
                              ).includes(enrollment.id);
                              return (
                                <button
                                  key={enrollment.id}
                                  type="button"
                                  onClick={() => addRecipientToCampaign(enrollment)}
                                  disabled={isSelected}
                                  className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 transition-colors hover:bg-gray-50 disabled:bg-gray-50"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {enrollment.form_data?.nome_completo ||
                                        enrollment.user_email ||
                                        `Inscrição #${enrollment.id}`}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      #{enrollment.id} ·{' '}
                                      {enrollment.user_email ||
                                        enrollment.form_data?.email ||
                                        'Sem email'}
                                    </p>
                                  </div>
                                  <span
                                    className={`text-xs font-medium ${
                                      isSelected ? 'text-gray-400' : 'text-purple'
                                    }`}
                                  >
                                    {isSelected ? 'Adicionado' : 'Adicionar'}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {selectedRecipients.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 text-xs font-medium text-gray-600">
                          Selecionados ({selectedRecipients.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedRecipients.map((recipient) => (
                            <button
                              key={recipient.id}
                              type="button"
                              onClick={() => removeRecipientFromCampaign(recipient.id)}
                              className="flex items-center gap-1.5 rounded-full border border-purple/20 bg-purple/5 px-3 py-1.5 text-xs font-medium text-purple transition-colors hover:bg-purple/10"
                            >
                              {recipient.form_data?.nome_completo ||
                                recipient.user_email ||
                                `#${recipient.id}`}
                              <span className="text-purple/60">✕</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Section 3: Salvar, testar, enviar */}
              <section className={cardClass}>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  3. Salvar e enviar
                </h4>

                <div className="space-y-5">
                  {/* Save */}
                  <div>
                    <button
                      type="button"
                      onClick={() => void handleSaveDraft()}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {campaignForm.id ? 'Salvar rascunho' : 'Criar rascunho'}
                    </button>
                  </div>

                  {/* Test */}
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className={labelClass}>Enviar e-mail de teste</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="email"
                        value={campaignTestEmail}
                        onChange={(e) => setCampaignTestEmail(e.target.value)}
                        placeholder="destino@exemplo.com"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => void handleCampaignTest()}
                        disabled={saving || !campaignTestEmail}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        Enviar teste
                      </button>
                    </div>
                  </div>

                  {/* Preview recipients */}
                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className={labelClass}>Prévia de destinatários</p>
                      <button
                        type="button"
                        onClick={() => void handlePreviewRecipients()}
                        disabled={saving}
                        className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                      >
                        Calcular
                      </button>
                    </div>
                    {recipientPreview ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-gray-700">
                          Total estimado:{' '}
                          <strong className="text-gray-950">{recipientPreview.count}</strong>
                        </p>
                        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                          {recipientPreview.sample.map((recipient) => (
                            <div
                              key={`${recipient.enrollment_id}-${recipient.email}`}
                              className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                            >
                              <p className="text-xs font-medium text-gray-900">{recipient.name}</p>
                              <p className="text-xs text-gray-500">{recipient.email}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">
                        Calcule para ver quantidade e amostra do público.
                      </p>
                    )}
                  </div>

                  {/* Send — only when saved as DRAFT */}
                  {campaignForm.id && campaignForm.status === 'DRAFT' && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-900">Envio definitivo</p>
                      <p className="mt-1 text-sm text-red-800">
                        Esta ação dispara o e-mail para todos os destinatários do filtro e não pode
                        ser desfeita.
                      </p>
                      {showSendConfirm ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSendCampaign()}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Confirmar envio
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSendConfirm(false)}
                            className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowSendConfirm(true)}
                          className="mt-3 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
                        >
                          Enviar para todos os destinatários
                        </button>
                      )}
                    </div>
                  )}

                  {campaignForm.status === 'SENT' && (
                    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                      <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600" />
                      <p className="text-sm font-medium text-green-800">
                        Campanha enviada — {selectedCampaign?.sent_count ?? 0}/
                        {selectedCampaign?.recipient_count ?? 0} destinatários.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Failed recipients */}
              {failedRecipients.length > 0 && (
                <section className={cardClass}>
                  <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Falhas de envio ({failedRecipients.length})
                  </h4>
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {failedRecipients.map((recipient) => (
                      <div
                        key={recipient.id}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                      >
                        <p className="text-sm font-medium text-red-900">
                          {recipient.name || recipient.email}
                        </p>
                        <p className="text-xs text-red-700">{recipient.email}</p>
                        <p className="mt-1 text-xs text-red-700">
                          {recipient.error_message || 'Falha no envio.'}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )
        )}
      </div>
    </AdminShell>
  );
}
