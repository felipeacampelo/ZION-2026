import { useEffect, useState } from 'react';
import { CheckCircle, ChevronDown, ChevronRight, Loader2, Mail, Paperclip, Save, Send, TriangleAlert, X } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import {
  createAdminEmailCampaign,
  getAdminEmailCampaign,
  getAdminEmailCampaigns,
  getAdminEnrollments,
  getAdminEmailTemplates,
  getAdminProducts,
  previewAdminEmailCampaignRecipientsByFilters,
  previewAdminEmailTemplate,
  sendAdminEmailCampaign,
  sendAdminEmailCampaignDraftTest,
  sendAdminEmailCampaignTest,
  sendAdminEmailTemplateTest,
  updateAdminEmailCampaign,
  updateAdminEmailTemplate,
  type EmailCampaign,
  type EmailCampaignFilters,
  type Enrollment,
  type EmailTemplate,
  type Product,
} from '../services/api';

type CampaignFilters = EmailCampaignFilters;

type CampaignForm = {
  id?: number;
  name: string;
  subject: string;
  html_content: string;
  text_content: string;
  filters: CampaignFilters;
  status?: EmailCampaign['status'];
  attachment_name?: string;
  attachment_url?: string | null;
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
  DRAFT:   { label: 'Rascunho',   className: 'bg-slate-100 text-slate-700' },
  SENDING: { label: 'Enviando',   className: 'bg-amber-100 text-amber-800' },
  SENT:    { label: 'Enviada',    className: 'bg-green-100 text-green-800' },
  FAILED:  { label: 'Com falhas', className: 'bg-red-100 text-red-800' },
};

const cardClass = 'rounded-2xl border border-gray-100 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-400';
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

function generateCampaignName(templateName: string) {
  const now = new Date();
  const date = now.toLocaleDateString('pt-BR');
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${templateName} — ${date} ${time}`;
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

  // — Campaign wizard —
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(emptyCampaignForm);
  const [campaignTemplateKey, setCampaignTemplateKey] = useState(''); // '' = nothing, '__custom__' = from scratch
  const [campaignTestEmail, setCampaignTestEmail] = useState('');
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [recipientPreview, setRecipientPreview] = useState<{
    count: number;
    sample: Array<{ enrollment_id: number; email: string; name: string }>;
  } | null>(null);
  const [previewingRecipients, setPreviewingRecipients] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientOptions, setRecipientOptions] = useState<Enrollment[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Enrollment[]>([]);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [campaignAttachment, setCampaignAttachment] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  // ─── Data loading ────────────────────────────────────────────────────────────

  const loadData = async () => {
    setError('');
    const [templatesRes, campaignsRes, productsRes] = await Promise.allSettled([
      getAdminEmailTemplates(),
      getAdminEmailCampaigns(),
      getAdminProducts(),
    ]);

    if (templatesRes.status === 'fulfilled') {
      setTemplates(templatesRes.value.data);
      const initial =
        templatesRes.value.data.find((t) => t.key === selectedTemplateKey) ||
        templatesRes.value.data[0] ||
        null;
      if (initial) {
        setSelectedTemplateKey(initial.key);
        setTemplateForm(initial);
      }
    }
    if (campaignsRes.status === 'fulfilled') setCampaigns(campaignsRes.value.data);
    if (productsRes.status === 'fulfilled') setProducts(productsRes.value.data);

    const failed = [templatesRes, campaignsRes, productsRes].filter(
      (r) => r.status === 'rejected',
    ).length;
    if (failed > 0) setError('Erro ao carregar alguns dados de emails.');

    setLoading(false);
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (!selectedTemplateKey || templates.length === 0) return;
    const match = templates.find((t) => t.key === selectedTemplateKey);
    if (match) { setTemplateForm(match); setTemplatePreview(null); }
  }, [selectedTemplateKey, templates]);

  // Auto-preview recipients as filters change on steps 2 & 3
  useEffect(() => {
    if (activeTab !== 'campaigns' || wizardStep === 1) return;
    const t = window.setTimeout(async () => {
      setPreviewingRecipients(true);
      try {
        const res = await previewAdminEmailCampaignRecipientsByFilters(campaignForm.filters);
        setRecipientPreview(res.data);
      } catch {
        // silent — user sees stale count
      } finally {
        setPreviewingRecipients(false);
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [campaignForm.filters, wizardStep, activeTab]);

  // Debounced recipient search
  useEffect(() => {
    if (activeTab !== 'campaigns') return;
    const t = window.setTimeout(async () => {
      setSearchingRecipients(true);
      try {
        const res = await getAdminEnrollments({
          search: recipientSearch.trim() || undefined,
          page: 1,
          page_size: 20,
        });
        setRecipientOptions(Array.isArray(res.data) ? res.data : res.data.results || []);
      } catch {
        // silent
      } finally {
        setSearchingRecipients(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [activeTab, recipientSearch]);

  // Sync selectedRecipients when enrollment_ids change
  useEffect(() => {
    const ids = campaignForm.filters.enrollment_ids || [];
    if (ids.length === 0) { setSelectedRecipients([]); return; }
    const currentIds = selectedRecipients.map((r) => r.id).sort((a, b) => a - b);
    const sorted = [...ids].sort((a, b) => a - b);
    if (currentIds.length === sorted.length && currentIds.every((id, i) => id === sorted[i])) return;
    (async () => {
      try {
        const res = await getAdminEnrollments({ ids, page: 1, page_size: ids.length });
        setSelectedRecipients(Array.isArray(res.data) ? res.data : res.data.results || []);
      } catch { /* silent */ }
    })();
  }, [campaignForm.filters.enrollment_ids, selectedRecipients]);

  // ─── Recipient helpers ────────────────────────────────────────────────────────

  const addRecipient = (enrollment: Enrollment) => {
    const ids = campaignForm.filters.enrollment_ids || [];
    if (ids.includes(enrollment.id)) return;
    setCampaignForm((f) => ({ ...f, filters: { ...f.filters, enrollment_ids: [...ids, enrollment.id] } }));
    setSelectedRecipients((r) => [...r, enrollment]);
  };

  const removeRecipient = (enrollmentId: number) => {
    setCampaignForm((f) => {
      const next = (f.filters.enrollment_ids || []).filter((id) => id !== enrollmentId);
      return { ...f, filters: { ...f.filters, enrollment_ids: next.length > 0 ? next : undefined } };
    });
    setSelectedRecipients((r) => r.filter((e) => e.id !== enrollmentId));
  };

  // ─── Template tab handlers ────────────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    if (!templateForm) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await updateAdminEmailTemplate(templateForm.key, {
        subject: templateForm.subject,
        html_content: templateForm.html_content,
        text_content: templateForm.text_content,
        is_active: templateForm.is_active,
      });
      setTemplates((ts) => ts.map((t) => (t.key === res.data.key ? res.data : t)));
      setTemplateForm(res.data);
      setSuccess('Template salvo.');
    } catch { setError('Erro ao salvar template.'); }
    finally { setSaving(false); }
  };

  const handlePreviewTemplate = async () => {
    if (!templateForm) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await updateAdminEmailTemplate(templateForm.key, {
        subject: templateForm.subject,
        html_content: templateForm.html_content,
        text_content: templateForm.text_content,
        is_active: templateForm.is_active,
      });
      const res = await previewAdminEmailTemplate(templateForm.key);
      setTemplatePreview(res.data);
    } catch { setError('Erro ao gerar preview.'); }
    finally { setSaving(false); }
  };

  const handleTemplateTest = async () => {
    if (!templateForm || !templateTestEmail) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      await updateAdminEmailTemplate(templateForm.key, {
        subject: templateForm.subject,
        html_content: templateForm.html_content,
        text_content: templateForm.text_content,
        is_active: templateForm.is_active,
      });
      await sendAdminEmailTemplateTest(templateForm.key, templateTestEmail);
      setSuccess('Teste enviado.');
    } catch { setError('Erro ao enviar teste.'); }
    finally { setSaving(false); }
  };

  // ─── Campaign wizard handlers ─────────────────────────────────────────────────

  const pickTemplate = (key: string) => {
    setCampaignTemplateKey(key);
    if (key === '__custom__') {
      setCampaignForm((f) => ({ ...f, subject: '', html_content: '', text_content: '' }));
      return;
    }
    const tpl = templates.find((t) => t.key === key);
    if (!tpl) return;
    setCampaignForm((f) => ({
      ...f,
      subject: tpl.subject,
      html_content: tpl.html_content,
      text_content: tpl.text_content,
    }));
  };

  const hasAttachmentChange = campaignAttachment !== null || removeAttachment;

  // Creates the campaign if it doesn't exist yet, or updates it, carrying over
  // the pending attachment change. Returns the campaign id.
  const saveCampaign = async (name: string) => {
    const payload = {
      name,
      subject: campaignForm.subject,
      html_content: campaignForm.html_content,
      text_content: campaignForm.text_content,
      filters: campaignForm.filters,
      attachmentFile: campaignAttachment,
      attachment_clear: removeAttachment,
    };
    if (!campaignForm.id) {
      const res = await createAdminEmailCampaign(payload);
      setCampaignForm((f) => ({ ...f, id: res.data.id, attachment_name: res.data.attachment_name, attachment_url: res.data.attachment_url }));
      setCampaignAttachment(null);
      setRemoveAttachment(false);
      return res.data.id;
    }
    const res = await updateAdminEmailCampaign(campaignForm.id, payload);
    setCampaignForm((f) => ({ ...f, attachment_name: res.data.attachment_name, attachment_url: res.data.attachment_url }));
    setCampaignAttachment(null);
    setRemoveAttachment(false);
    return campaignForm.id;
  };

  const handleCampaignTest = async () => {
    if (!campaignTestEmail) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      if (!campaignForm.id && !hasAttachmentChange) {
        await sendAdminEmailCampaignDraftTest({
          to_email: campaignTestEmail,
          subject: campaignForm.subject,
          html_content: campaignForm.html_content,
          text_content: campaignForm.text_content,
          filters: campaignForm.filters,
        });
      } else {
        const templateLabel =
          campaignTemplateKey === '__custom__'
            ? 'Email personalizado'
            : templates.find((t) => t.key === campaignTemplateKey)?.name ?? 'Email';
        const id = await saveCampaign(campaignForm.name.trim() || generateCampaignName(templateLabel));
        await sendAdminEmailCampaignTest(id, campaignTestEmail);
      }
      setSuccess('Teste enviado.');
    } catch (err: any) { setError(getApiErrorMessage(err, 'Erro ao enviar teste.')); }
    finally { setSaving(false); }
  };

  const handleQuickSend = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const templateLabel =
        campaignTemplateKey === '__custom__'
          ? 'Email personalizado'
          : templates.find((t) => t.key === campaignTemplateKey)?.name ?? 'Email';
      const campaignId = await saveCampaign(campaignForm.name.trim() || generateCampaignName(templateLabel));

      const res = await sendAdminEmailCampaign(campaignId);
      await loadData();
      setSuccess(`Enviado para ${res.data.recipient_count} destinatário(s).`);

      // Reset wizard
      setCampaignForm(emptyCampaignForm);
      setCampaignTemplateKey('');
      setWizardStep(1);
      setRecipientPreview(null);
      setShowSendConfirm(false);
      setSelectedRecipients([]);
      setCampaignAttachment(null);
      setRemoveAttachment(false);
      setShowHistory(true);
    } catch (err: any) { setError(getApiErrorMessage(err, 'Erro ao enviar.')); }
    finally { setSaving(false); }
  };

  const resetWizard = () => {
    setCampaignForm(emptyCampaignForm);
    setCampaignTemplateKey('');
    setWizardStep(1);
    setRecipientPreview(null);
    setShowSendConfirm(false);
    setSelectedRecipients([]);
    setCampaignAttachment(null);
    setRemoveAttachment(false);
    setError('');
    setSuccess('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Emails</h2>
          <p className="mt-2 text-sm text-gray-600">
            Edite templates automáticos e gerencie campanhas com Resend.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 w-fit rounded-xl border border-gray-200 bg-gray-50 p-1">
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
              {tab === 'templates' ? 'Templates' : 'Enviar campanha'}
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
          <div className={`${cardClass} p-5`}>
            <div className="flex items-center gap-3 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando...
            </div>
          </div>
        ) : activeTab === 'templates' ? (

          /* ══════════════════ TEMPLATES TAB ══════════════════ */
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* List */}
            <div className={`${cardClass} p-4`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                Templates
              </p>
              <div className="space-y-1.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setSelectedTemplateKey(tpl.key)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                      selectedTemplateKey === tpl.key
                        ? 'border-purple/30 bg-purple/5'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${tpl.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={tpl.is_active ? 'Ativo' : 'Inativo'}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Editor */}
            {templateForm && (
              <div className="space-y-5">
                <div className={`${cardClass} p-5 lg:p-6`}>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-4">
                      {/* Toggle */}
                      <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Template ativo</p>
                          <p className="text-xs text-gray-500">
                            Desativado, o disparo automático é ignorado.
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
                          onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>HTML</label>
                        <textarea
                          value={templateForm.html_content}
                          onChange={(e) => setTemplateForm({ ...templateForm, html_content: e.target.value })}
                          rows={16}
                          className={`${inputClass} font-mono text-xs`}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Texto fallback</label>
                        <textarea
                          value={templateForm.text_content}
                          onChange={(e) => setTemplateForm({ ...templateForm, text_content: e.target.value })}
                          rows={5}
                          className={`${inputClass} font-mono text-xs`}
                        />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleSaveTemplate()}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePreviewTemplate()}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          <Mail className="h-4 w-4" />
                          Salvar e pré-visualizar
                        </button>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-4">
                        <label className={labelClass}>Enviar teste</label>
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
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            <Send className="h-4 w-4" />
                            Enviar
                          </button>
                        </div>
                      </div>

                      {templatePreview && (
                        <div className="rounded-xl border border-gray-200 p-4">
                          <p className="mb-1 text-sm font-medium text-gray-900">Preview</p>
                          <p className="mb-4 text-sm text-gray-500">
                            <strong>Assunto:</strong> {templatePreview.subject}
                          </p>
                          <div
                            className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                            dangerouslySetInnerHTML={{ __html: templatePreview.html_content }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Tokens */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-400">
                        Tokens
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

          /* ══════════════════ CAMPAIGNS TAB ══════════════════ */
          <div className="space-y-5">

            {/* Step indicator */}
            <div className={`${cardClass} p-4`}>
              <div className="flex items-center gap-0">
                {([
                  { n: 1, label: 'Template' },
                  { n: 2, label: 'Público' },
                  { n: 3, label: 'Enviar' },
                ] as const).map(({ n, label }, i) => (
                  <div key={n} className="flex items-center">
                    {i > 0 && (
                      <div className={`h-px w-8 sm:w-16 ${wizardStep > i ? 'bg-gray-900' : 'bg-gray-200'}`} />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (n < wizardStep) setWizardStep(n);
                      }}
                      disabled={n >= wizardStep}
                      className="flex items-center gap-2 disabled:cursor-default"
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                          wizardStep === n
                            ? 'bg-gray-950 text-white'
                            : wizardStep > n
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {wizardStep > n ? '✓' : n}
                      </span>
                      <span
                        className={`hidden text-sm font-medium sm:block ${
                          wizardStep === n ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  </div>
                ))}

                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={resetWizard}
                    className="text-xs text-gray-400 underline-offset-2 hover:text-gray-600 hover:underline"
                  >
                    Recomeçar
                  </button>
                </div>
              </div>
            </div>

            {/* ── Step 1: Template ── */}
            {wizardStep === 1 && (
              <div className={`${cardClass} p-5 lg:p-6`}>
                <h3 className="text-base font-semibold text-gray-900">
                  Qual template você quer enviar?
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  O conteúdo do template será usado como base. Você poderá ajustar o assunto no passo seguinte.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => pickTemplate(tpl.key)}
                      className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                        campaignTemplateKey === tpl.key
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {campaignTemplateKey === tpl.key && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white">
                          ✓
                        </span>
                      )}
                      <p className="pr-6 text-sm font-semibold text-gray-900">{tpl.name}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-gray-500">{tpl.subject}</p>
                      {!tpl.is_active && (
                        <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          Inativo
                        </span>
                      )}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => pickTemplate('__custom__')}
                    className={`rounded-xl border-2 border-dashed p-4 text-left transition-all ${
                      campaignTemplateKey === '__custom__'
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-700">Escrever do zero</p>
                    <p className="mt-1 text-xs text-gray-500">HTML e texto personalizados</p>
                  </button>
                </div>

                {/* Custom content fields */}
                {campaignTemplateKey === '__custom__' && (
                  <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
                    <div>
                      <label className={labelClass}>Assunto</label>
                      <input
                        value={campaignForm.subject}
                        onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                        placeholder="Assunto do email"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>HTML</label>
                      <textarea
                        value={campaignForm.html_content}
                        onChange={(e) => setCampaignForm({ ...campaignForm, html_content: e.target.value })}
                        rows={12}
                        className={`${inputClass} font-mono text-xs`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Texto fallback</label>
                      <textarea
                        value={campaignForm.text_content}
                        onChange={(e) => setCampaignForm({ ...campaignForm, text_content: e.target.value })}
                        rows={4}
                        className={`${inputClass} font-mono text-xs`}
                      />
                    </div>
                  </div>
                )}

                {/* Attachment */}
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <label className={labelClass}>Anexo em PDF (opcional)</label>
                  <p className="mb-2 text-xs text-gray-500">
                    Anexe um arquivo PDF para ser enviado junto com o email.
                  </p>

                  {campaignAttachment ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-2.5">
                      <span className="flex items-center gap-2 truncate text-sm text-gray-700">
                        <Paperclip className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        {campaignAttachment.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCampaignAttachment(null)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : campaignForm.attachment_url && !removeAttachment ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-2.5">
                      <span className="flex items-center gap-2 truncate text-sm text-gray-700">
                        <Paperclip className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        {campaignForm.attachment_name || 'anexo.pdf'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemoveAttachment(true)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => {
                        setCampaignAttachment(e.target.files?.[0] ?? null);
                        setRemoveAttachment(false);
                      }}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                    />
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    disabled={!campaignTemplateKey}
                    onClick={() => setWizardStep(2)}
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Próximo: Público
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Público ── */}
            {wizardStep === 2 && (
              <div className={`${cardClass} p-5 lg:p-6`}>
                <h3 className="text-base font-semibold text-gray-900">Para quem você quer enviar?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Deixe todos os filtros em branco para enviar para todos os inscritos.
                </p>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <select
                    value={campaignForm.filters.product || ''}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        filters: { ...campaignForm.filters, product: e.target.value ? Number(e.target.value) : undefined },
                      })
                    }
                    className={inputClass}
                  >
                    <option value="">Todos os produtos</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
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
                        filters: { ...campaignForm.filters, payment_method: e.target.value || undefined },
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
                        filters: { ...campaignForm.filters, payment_state: e.target.value || undefined },
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
                        filters: { ...campaignForm.filters, search: e.target.value || undefined },
                      })
                    }
                    placeholder="Buscar por nome, email ou CPF"
                    className={inputClass}
                  />
                </div>

                {/* Recipient target */}
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="text-sm font-medium text-gray-700">Enviar para</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Escolha se o email vai para o próprio inscrito ou para o responsável indicado na inscrição.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {([
                      { value: 'participant', label: 'Email do inscrito' },
                      { value: 'responsible', label: 'Email do responsável' },
                    ] as const).map((option) => {
                      const isSelected = (campaignForm.filters.recipient_target || 'participant') === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setCampaignForm({
                              ...campaignForm,
                              filters: { ...campaignForm.filters, recipient_target: option.value },
                            })
                          }
                          className={`rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                            isSelected
                              ? 'border-gray-900 bg-gray-50 text-gray-900'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {campaignForm.filters.recipient_target === 'responsible' && (
                    <p className="mt-2 text-xs text-amber-600">
                      Inscrições sem email de responsável cadastrado serão ignoradas.
                    </p>
                  )}
                </div>

                {/* Specific recipients */}
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="text-sm font-medium text-gray-700">
                    Inscritos específicos{' '}
                    <span className="font-normal text-gray-400">(opcional)</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Quando preenchido, a campanha é restrita a esses inscritos além dos filtros acima.
                  </p>
                  <input
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Buscar inscrito por nome, email ou CPF"
                    className={`${inputClass} mt-3`}
                  />
                  <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
                    {searchingRecipients ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando...
                      </div>
                    ) : recipientOptions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Nenhum inscrito encontrado.</div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {recipientOptions.map((enrollment) => {
                          const isSelected = (campaignForm.filters.enrollment_ids || []).includes(enrollment.id);
                          return (
                            <button
                              key={enrollment.id}
                              type="button"
                              onClick={() => addRecipient(enrollment)}
                              disabled={isSelected}
                              className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-gray-50 disabled:bg-gray-50"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {enrollment.form_data?.nome_completo || enrollment.user_email || `#${enrollment.id}`}
                                </p>
                                <p className="text-xs text-gray-400">
                                  #{enrollment.id} · {enrollment.user_email || '—'}
                                </p>
                              </div>
                              <span className={`text-xs font-medium ${isSelected ? 'text-gray-300' : 'text-purple'}`}>
                                {isSelected ? 'Adicionado' : 'Adicionar'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedRecipients.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedRecipients.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => removeRecipient(r.id)}
                          className="flex items-center gap-1.5 rounded-full border border-purple/20 bg-purple/5 px-3 py-1 text-xs font-medium text-purple hover:bg-purple/10"
                        >
                          {r.form_data?.nome_completo || r.user_email || `#${r.id}`}
                          <span className="text-purple/50">✕</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live count */}
                <div className="mt-5 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  {previewingRecipients ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      <span className="text-sm text-gray-500">Calculando destinatários...</span>
                    </>
                  ) : recipientPreview ? (
                    <>
                      <span className="text-2xl font-bold text-gray-950">{recipientPreview.count}</span>
                      <span className="text-sm text-gray-500">
                        {recipientPreview.count === 1 ? 'destinatário' : 'destinatários'}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">
                      Defina os filtros para calcular automaticamente.
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    ← Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Próximo: Revisar
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Revisar e enviar ── */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                {/* Summary */}
                <div className={`${cardClass} p-5 lg:p-6`}>
                  <h3 className="text-base font-semibold text-gray-900">Revisar antes de enviar</h3>

                  <div className="mt-5 space-y-4">
                    {/* Subject (editable) */}
                    <div>
                      <label className={labelClass}>Assunto</label>
                      <input
                        value={campaignForm.subject}
                        onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    {/* Recipient count */}
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      {previewingRecipients ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          <span className="text-sm text-gray-500">Calculando...</span>
                        </>
                      ) : recipientPreview ? (
                        <>
                          <span className="text-2xl font-bold text-gray-950">{recipientPreview.count}</span>
                          <span className="text-sm text-gray-500">
                            {recipientPreview.count === 1 ? 'destinatário' : 'destinatários'}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">Contagem não calculada.</span>
                      )}
                    </div>

                    {/* Sample */}
                    {recipientPreview && recipientPreview.sample.length > 0 && (
                      <div className="max-h-40 space-y-1.5 overflow-y-auto">
                        {recipientPreview.sample.map((r) => (
                          <div
                            key={`${r.enrollment_id}-${r.email}`}
                            className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                          >
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                              {(r.name || r.email)[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-gray-900">{r.name}</p>
                              <p className="truncate text-xs text-gray-400">{r.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Name (optional, auto-generated) */}
                    <div>
                      <label className={labelClass}>
                        Nome para o histórico{' '}
                        <span className="font-normal text-gray-400">(gerado automaticamente se vazio)</span>
                      </label>
                      <input
                        value={campaignForm.name}
                        onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                        placeholder={generateCampaignName(
                          campaignTemplateKey === '__custom__'
                            ? 'Email personalizado'
                            : templates.find((t) => t.key === campaignTemplateKey)?.name ?? 'Email',
                        )}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Test send */}
                <div className={`${cardClass} p-5`}>
                  <label className={labelClass}>Enviar e-mail de teste</label>
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                      Enviar teste
                    </button>
                  </div>
                </div>

                {/* Send */}
                <div className={`${cardClass} p-5`}>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      ← Voltar
                    </button>

                    {showSendConfirm ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">Tem certeza?</span>
                        <button
                          type="button"
                          onClick={() => setShowSendConfirm(false)}
                          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleQuickSend()}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Confirmar envio
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSendConfirm(true)}
                        disabled={!campaignForm.subject}
                        className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" />
                        {recipientPreview
                          ? `Enviar para ${recipientPreview.count} ${recipientPreview.count === 1 ? 'pessoa' : 'pessoas'}`
                          : 'Enviar campanha'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* History toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600"
              >
                {showHistory ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Histórico de campanhas
                {campaigns.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {campaigns.length}
                  </span>
                )}
              </button>

              {showHistory && (
                <div className={`${cardClass} mt-3 p-4`}>
                  {campaigns.length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhuma campanha enviada ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {campaigns.map((campaign) => {
                        const meta = CAMPAIGN_STATUS[campaign.status] ?? {
                          label: campaign.status,
                          className: 'bg-gray-100 text-gray-600',
                        };
                        return (
                          <div
                            key={campaign.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{campaign.name}</p>
                              <p className="mt-0.5 text-xs text-gray-400">
                                {campaign.sent_count}/{campaign.recipient_count} enviados
                                {campaign.failed_count > 0 && (
                                  <span className="ml-1.5 text-red-500">· {campaign.failed_count} falhas</span>
                                )}
                              </p>
                            </div>
                            <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
                              {meta.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
