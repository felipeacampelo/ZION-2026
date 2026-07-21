import axios from 'axios';
import type { AxiosProgressEvent } from 'axios';

// API base URL: configurable via environment (VITE_API_URL) for Railway/production
// Falls back to localhost for local development
export const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api';
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export const resolveMediaUrl = (value?: string | null) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, `${API_ORIGIN}/`).toString();
};

// Função para obter o CSRF token do cookie
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Interceptor para adicionar token de autenticação e CSRF token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  
  // Adicionar CSRF token para métodos que modificam dados
  const csrfToken = getCookie('csrftoken');
  if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  
  return config;
});

export interface Product {
  id: number;
  name: string;
  description: string;
  image: string | null;
  base_price: string;
  max_installments: number;
  is_active: boolean;
  event_date?: string;
  active_batch?: Batch;
  waitlist_state?: string;
}

export interface Batch {
  id: number;
  product?: number;
  product_name?: string;
  next_batch?: number | null;
  next_batch_name?: string | null;
  name: string;
  start_date: string;
  end_date: string;
  price: string; // PIX à vista
  pix_installment_price: string; // PIX parcelado
  credit_card_price: string; // Cartão de crédito
  pix_discount_percentage?: string; // Deprecated
  pix_price?: number; // Deprecated
  max_enrollments: number | null;
  current_enrollments: number;
  is_full: boolean;
  status: string;
  is_visible_on_site?: boolean;
}

export interface Coupon {
  id: number;
  code: string;
  description?: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: string;
  max_discount?: string | null;
  min_purchase: string;
  max_uses?: number | null;
  uses_count: number;
  valid_from: string;
  valid_until: string;
  active: boolean;
  enable_12x_installments: boolean;
  max_installments: number;
  products: number[];
  allowed_payment_methods: Array<'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD'>;
  allow_installments: boolean;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: number;
  user_email?: string;
  participant_name?: string;
  product?: Product;
  batch?: Batch;
  product_name?: string;
  batch_name?: string;
  form_data?: any;
  status: string;
  payment_method?: string | null;
  installments?: number;
  max_installments?: number;
  total_amount?: string;
  discount_amount?: string;
  final_amount: string;
  pricing_snapshot?: Record<string, string>;
  created_at: string;
  paid_at?: string | null;
  payments?: Payment[];
  social_quota_contributions?: SocialQuotaContribution[];
  is_social_quota?: boolean;
  social_coupon_code?: string;
  social_goal_amount?: string;
  social_paid_amount?: string;
  social_raised_amount?: string;
  social_total_progress?: string;
  social_remaining_amount?: string;
  social_is_completed?: boolean;
  reservation_expires_at?: string | null;
}

export interface WaitlistEntry {
  id: number;
  participant_name: string;
  email: string;
  phone: string;
  product: number;
  product_name: string;
  status: string;
  position: number;
  coupon_code: string;
  reference_batch_name?: string | null;
  waitlist_payment_state?: 'PAID' | 'PENDING_PAYMENT' | null;
  invited_at?: string | null;
  invite_expires_at?: string | null;
  converted_at?: string | null;
  removed_at?: string | null;
  removal_reason?: string;
  created_at: string;
}

export interface SocialQuotaContribution {
  id: number;
  date: string;
  amount: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SocialQuotaSummary {
  total: number;
  completed: number;
  raised_total: number;
  remaining_total: number;
}

export interface SocialQuotaListResponse {
  count: number;
  summary: SocialQuotaSummary;
  results: Enrollment[];
}

export interface EmpireBoardItem {
  id: number;
  participant_name: string;
  user_email: string;
  phone: string;
  cpf: string;
  birth_date: string;
  age: number | null;
  gender?: 'male' | 'female' | null;
}

export interface EmpireBoardColumn {
  count: number;
  average_age: number | null;
  summary: EmpireBoardSummary;
  items: EmpireBoardItem[];
}

export interface EmpireBoardSummary {
  total: number;
  male_count: number;
  female_count: number;
  unknown_gender_count: number;
  age_16_plus_count: number;
  sub16_count: number;
  birth_year_groups: {
    '2008': number;
    '2009': number;
    '2010': number;
    '2011': number;
    '2012': number;
    '2013': number;
  };
}

export interface EmpireBoardResponse {
  egito: EmpireBoardColumn;
  persia: EmpireBoardColumn;
  grecia: EmpireBoardColumn;
  roma: EmpireBoardColumn;
  none: EmpireBoardColumn;
  summary: EmpireBoardSummary;
}

export interface Payment {
  id: number;
  enrollment: any;
  asaas_payment_id: string;
  installment_number: number;
  amount: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  payment_url: string;
  pix_qr_code: string;
  pix_copy_paste: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface OverduePaymentSummary {
  id: number;
  installment_number: number;
  amount: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  days_overdue: number;
}

export interface OverdueEnrollmentSummary extends Enrollment {
  overdue_payments: OverduePaymentSummary[];
  overdue_payments_count: number;
  total_overdue_amount: string;
  oldest_due_date: string | null;
}

export interface FormFieldConfig {
  enabled: boolean;
  required: boolean;
  label: string;
}

export interface ResponsibleFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'phone' | 'cpf' | 'date' | 'select' | 'checkbox';
  required: boolean;
  placeholder: string;
  options: string[];
  position?: number;
}

export interface EmailTemplate {
  key: string;
  name: string;
  subject: string;
  html_content: string;
  text_content: string;
  is_active: boolean;
  available_tokens: string[];
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignRecipient {
  id: number;
  enrollment_id: number | null;
  email: string;
  name: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  error_message: string;
  sent_at: string | null;
}

export type EmailCampaignFilters = {
  product?: number;
  status?: string;
  payment_method?: string;
  payment_state?: string;
  search?: string;
  enrollment_ids?: number[];
  recipient_target?: 'participant' | 'responsible';
};

export interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  html_content: string;
  text_content: string;
  filters: EmailCampaignFilters;
  status: 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED' | 'PARTIAL';
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  test_email: string;
  attachment_name: string;
  attachment_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_by: number | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  recipients: EmailCampaignRecipient[];
}

export interface FinanceUserOption {
  id: number;
  email: string;
  name: string;
}

export interface FinanceBudgetSummary {
  allocated_amount: string;
  pending_amount: string;
  committed_amount: string;
  executed_amount: string;
  available_amount: string;
}

export interface FinanceArea {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  leaders: FinanceUserOption[];
  leaders_have_ineligible: boolean;
  budget: {
    allocated_amount: string;
  };
  summary: FinanceBudgetSummary;
  created_at: string;
  updated_at: string;
}

export interface FinanceRubric {
  id: number;
  area: number;
  area_name: string;
  name: string;
  description: string;
  allocated_amount: string;
  is_active: boolean;
  summary: FinanceBudgetSummary;
  created_at: string;
  updated_at: string;
}

export interface FinanceAttachment {
  id: number;
  category: 'SUPPORTING' | 'RECEIPT' | 'DEPOSIT_RECEIPT' | 'SETTLEMENT_PROOF' | 'RETURN_RECEIPT';
  file: string;
  uploaded_by_email: string;
  can_manage: boolean;
  created_at: string;
}

export interface FinanceAuditLog {
  id: number;
  action: string;
  note: string;
  metadata: Record<string, any>;
  actor_email: string;
  created_at: string;
}

export interface FinanceExecution {
  id: number;
  execution_type: 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT' | null;
  status: 'NOT_EXECUTED' | 'EXECUTED';
  amount: string;
  notes: string;
  settlement_status: 'NOT_REQUIRED' | 'PENDING_PROOF' | 'PENDING_RETURN' | 'SETTLED' | 'MANUALLY_CLOSED';
  spent_amount: string | null;
  returned_amount: string | null;
  settlement_notes: string;
  executed_by_email: string;
  settled_by_email: string;
  executed_at: string | null;
  settled_at: string | null;
  can_submit_settlement: boolean;
  can_confirm_return: boolean;
  can_manual_close: boolean;
  attachments: FinanceAttachment[];
}

export interface FinanceExpenseRequest {
  id: number;
  area: number;
  area_name: string;
  rubric: number;
  rubric_name: string;
  requester: number;
  requester_email: string;
  amount: string;
  request_type: 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT';
  request_type_display: string;
  recipient_name: string;
  pix_key: string;
  description: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejection_reason: string;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  execution: FinanceExecution | null;
  attachments: FinanceAttachment[];
  audit_logs: FinanceAuditLog[];
}

export interface FinanceSupplier {
  id: number;
  name: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceSupplierEligibleRequest {
  id: number;
  area: number;
  area_name: string;
  rubric: number;
  rubric_name: string;
  amount: string;
  request_type: 'DIRECT_PAYMENT';
  request_type_display: string;
  recipient_name: string;
  description: string;
  approved_at: string | null;
  scheduled_amount: string;
  paid_amount: string;
  remaining_amount: string;
}

export interface FinanceSupplierPayment {
  id: number;
  supplier: number;
  supplier_name: string;
  expense_request: number;
  expense_request_summary: FinanceSupplierEligibleRequest;
  area: number;
  area_name: string;
  rubric: number;
  rubric_name: string;
  amount: string;
  scheduled_date: string;
  paid_on: string | null;
  status: 'PENDING' | 'PAID';
  notes: string;
  paid_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface ExtraContribution {
  id: number;
  label: string;
  amount: string;
  source_type: 'OFFERING' | 'INVESTOR' | 'DONATION' | 'OTHER';
  source_type_display: string;
  date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface FinanceGlobalSummary {
  revenue: {
    total: string;
    fees: string;
    net: string;
    payments_count: number;
  };
  budgets: {
    allocated_total: string;
    remaining_to_allocate: string;
    awaiting_approval_total: string;
  };
  extra_contributions: {
    total: string;
    combined_with_net: string;
  };
}

export interface FinanceReportResponse extends FinanceGlobalSummary {
  report: {
    areas: Array<{
      id: number;
      name: string;
      allocated_amount: string;
      pending_amount: string;
      committed_amount: string;
      executed_amount: string;
      available_amount: string;
    }>;
    rubrics: Array<{
      id: number;
      name: string;
      area_id: number;
      area_name: string;
      allocated_amount: string;
      pending_amount: string;
      committed_amount: string;
      executed_amount: string;
      available_amount: string;
    }>;
    advance_settlement: {
      pending_proof_count: number;
      pending_proof_amount: string;
      pending_return_count: number;
      pending_return_amount: string;
    };
  };
}

export interface FinanceMyDashboardResponse {
  areas: Array<{
    id: number;
    name: string;
  }>;
  area: FinanceArea;
  summary: FinanceBudgetSummary;
  requests: FinanceExpenseRequest[];
  rubrics: FinanceRubric[];
}

// Auth (old - to be removed or migrated)
// export const login = (email: string, password: string) =>
//   api.post('/auth/login/', { email, password });
// export const logout = () => api.post('/auth/logout/');
// export const getMe = () => api.get('/auth/me/');

// Products
export const getProducts = () => api.get<{ results: Product[] }>('/products/products/');

export const getProduct = (id: number) =>
  api.get<Product>(`/products/products/${id}/`);

// Enrollments
export const createEnrollment = (data: {
  product_id: number;
  batch_id: number;
  form_data: any;
  coupon_code?: string;
}) => api.post<Enrollment>('/enrollments/', data);

export const validateCoupon = (data: {
  code: string;
  product_id: number;
  amount: number;
  payment_method?: string;
  installments?: number;
}) => api.post('/enrollments/validate-coupon/', data);

export const checkEnrollmentCpf = (data: { product_id: number; cpf: string }) =>
  api.post<{ exists: boolean; message: string; enrollment_id?: number }>('/enrollments/check-cpf/', data);

export const getEnrollments = () => api.get<Enrollment[]>('/enrollments/');

export const getEnrollment = (id: number) =>
  api.get<Enrollment>(`/enrollments/${id}/`);

export const updateEnrollment = (id: number, data: { form_data: any; coupon_code?: string }) =>
  api.patch<Enrollment>(`/enrollments/${id}/`, data);

// Payments
export const createPayment = (data: {
  enrollment_id: number;
  payment_method: string;
  installments: number;
}) => api.post<Payment>('/payments/', data);

export const calculatePayment = (data: {
  enrollment_id: number;
  payment_method: string;
  installments: number;
}) => api.post('/payments/calculate/', data);

// Authentication
export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  can_view_finance_admin: boolean;
  can_manage_finance: boolean;
  profile?: {
    phone: string;
    cpf: string;
  };
}

export interface AuthResponse {
  user: User;
  token: string;
}

export const register = (data: {
  email: string;
  password: string;
  password2: string;
  first_name: string;
  last_name: string;
  phone?: string;
  cpf?: string;
}) => api.post<AuthResponse>('/users/register/', data);

export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/users/login/', { email, password });

export const logout = () => api.post('/users/logout/');

export const getCurrentUser = () => api.get<User>('/users/profile/');

export const changePassword = (data: {
  old_password: string;
  new_password: string;
  new_password2: string;
}) => api.post('/users/change-password/', data);

// Admin endpoints
export const getAdminDashboard = () => api.get('/users/admin/dashboard/');
export const exportAdminAsaasExtract = (
  params?: { start_date?: string; finish_date?: string },
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void,
) =>
  api.get('/users/admin/dashboard/export-asaas-extract/', {
    params,
    responseType: 'blob',
    onDownloadProgress,
  });
export const exportAdminAsaasExtractJson = (
  params?: { start_date?: string; finish_date?: string },
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void,
) =>
  api.get('/users/admin/dashboard/export-asaas-extract-json/', {
    params,
    responseType: 'blob',
    onDownloadProgress,
  });

export const getAdminEnrollments = (params?: {
  status?: string;
  product?: number;
  search?: string;
  payment_method?: string;
  payment_state?: string;
  social_quota?: string;
  empire?: string;
  gender?: 'male' | 'female' | 'unknown';
  ids?: number[];
  page?: number;
  page_size?: number;
}) =>
  api.get<PaginatedResponse<Enrollment>>('/users/admin/enrollments/', {
    params: {
      ...params,
      ids: params?.ids?.join(','),
    },
  });

export const getAdminOverdueEnrollments = () =>
  api.get<{
    count: number;
    total_overdue_payments: number;
    total_overdue_amount: string;
    results: OverdueEnrollmentSummary[];
  }>('/users/admin/overdue-enrollments/');

export const getAdminSocialQuotas = (params?: { search?: string }) =>
  api.get<SocialQuotaListResponse>('/users/admin/social-quotas/', { params });

export const getAdminEmpiresBoard = () =>
  api.get<EmpireBoardResponse>('/users/admin/empires/');

export const allocateAdminEmpire = (data: { enrollment_id: number; target_empire: 'egito' | 'persia' | 'grecia' | 'roma' | 'none' }) =>
  api.post<{ detail: string; board: EmpireBoardResponse }>('/users/admin/empires/allocate/', data);

export const createAdminSocialQuotaContribution = (data: {
  enrollment_id: number;
  date: string;
  amount: string;
  notes?: string;
}) => api.post<SocialQuotaContribution>('/users/admin/social-quotas/contributions/', data);

export const updateAdminSocialQuotaContribution = (
  id: number,
  data: Partial<{ enrollment_id: number; date: string; amount: string; notes: string }>
) => api.patch<SocialQuotaContribution>(`/users/admin/social-quotas/contributions/${id}/`, data);

export const deleteAdminSocialQuotaContribution = (id: number) =>
  api.delete(`/users/admin/social-quotas/contributions/${id}/`);

export const updateAdminEnrollment = (id: number, data: { status: string }) =>
  api.patch(`/users/admin/enrollments/${id}/`, data);

export const getAdminProducts = () => api.get('/users/admin/products/');

export const getAdminBatches = () => api.get<Batch[]>('/users/admin/batches/');

export const getAdminCoupons = () => api.get<Coupon[]>('/users/admin/coupons/');

export const createAdminProduct = (data: any) =>
  api.post('/users/admin/products/create/', data);

export const updateAdminProduct = (id: number, data: any) =>
  api.patch(`/users/admin/products/${id}/`, data);

export const deleteAdminProduct = (id: number) =>
  api.delete(`/users/admin/products/${id}/delete/`);

export const closeAdminProductEnrollment = (id: number) =>
  api.post<{ detail: string; closed_batch_ids: number[]; batches: Batch[] }>(
    `/users/admin/products/${id}/close-enrollment/`,
    {},
  );

export const createAdminBatch = (data: any) =>
  api.post('/users/admin/batches/create/', data);

export const updateAdminBatch = (id: number, data: any) =>
  api.patch(`/users/admin/batches/${id}/`, data);

export const deleteAdminBatch = (id: number) =>
  api.delete(`/users/admin/batches/${id}/delete/`);

export const createAdminCoupon = (data: Partial<Coupon>) =>
  api.post('/users/admin/coupons/create/', data);

export const updateAdminCoupon = (id: number, data: Partial<Coupon>) =>
  api.patch(`/users/admin/coupons/${id}/`, data);

export const deleteAdminCoupon = (id: number) =>
  api.delete(`/users/admin/coupons/${id}/delete/`);

// Settings endpoints
export interface AppSettings {
  home_description: string;
  home_date_text: string;
  home_location_text: string;
  home_location_subtext: string;
  enable_waitlist_public: boolean;
  waitlist_public_start_at: string | null;
  enrollment_start_at: string | null;
  enrollment_end_at: string | null;
  max_installments: number;
  max_installments_with_coupon: number;
  enable_pix_cash: boolean;
  enable_pix_installment: boolean;
  enable_credit_card: boolean;
  enable_coupons: boolean;
  enable_shirt_size_field: boolean;
  form_fields_config: Record<string, FormFieldConfig>;
  responsible_fields_config: ResponsibleFieldConfig[];
  max_age_years: number;
  min_birth_year: number;
  max_birth_year: number | null;
  waitlist_auto_invite_enabled: boolean;
}

export const getSettings = () => api.get<AppSettings>('/enrollments/settings/');
export const getAdminSettings = () => api.get<AppSettings>('/users/admin/settings/');
export const updateAdminSettings = (data: Partial<AppSettings>) =>
  api.patch<AppSettings>('/users/admin/settings/', data);

export const joinWaitlist = (data: {
  product_id: number;
  form_data: any;
  coupon_code?: string;
}) => api.post<WaitlistEntry>('/enrollments/waitlist/', data);

export const getWaitlistInvite = (token: string) =>
  api.get<{ enrollment: Enrollment; invite_expires_at: string; waitlist_entry: WaitlistEntry | null }>(`/enrollments/waitlist/invite/${token}/`);

export const updateWaitlistInvite = (token: string, data: { form_data: any }) =>
  api.patch<Enrollment>(`/enrollments/waitlist/invite/${token}/`, data);

export const createWaitlistInvitePayment = (token: string, data: { payment_method: string; installments: number }) =>
  api.post<Payment>(`/enrollments/waitlist/invite/${token}/create-payment/`, data);

export const getAdminWaitlist = (params?: { product?: number }) =>
  api.get<{ results: WaitlistEntry[]; auto_invite_enabled: boolean }>('/users/admin/waitlist/', { params });

export const inviteAdminWaitlistEntry = (id: number) =>
  api.post<{ detail: string; enrollment_id: number }>(`/users/admin/waitlist/${id}/invite/`, {});

export const extendAdminWaitlistDeadline = (id: number, data: { expires_at: string }) =>
  api.post<WaitlistEntry>(`/users/admin/waitlist/${id}/extend-deadline/`, data);

export const deleteAdminWaitlistEntry = (id: number) =>
  api.delete(`/users/admin/waitlist/${id}/delete/`);

export const reorderAdminWaitlist = (data: { product_id: number; ordered_ids: number[] }) =>
  api.post('/users/admin/waitlist/reorder/', data);

export const toggleAdminWaitlistAutoInvite = (enabled: boolean) =>
  api.post<{ waitlist_auto_invite_enabled: boolean }>('/users/admin/waitlist/auto-invite/', { enabled });

export const getAdminEmailTemplates = () =>
  api.get<EmailTemplate[]>('/users/admin/email-templates/');

export const getAdminEmailTemplate = (key: string) =>
  api.get<EmailTemplate>(`/users/admin/email-templates/${key}/`);

export const updateAdminEmailTemplate = (key: string, data: Partial<EmailTemplate>) =>
  api.patch<EmailTemplate>(`/users/admin/email-templates/${key}/`, data);

export const previewAdminEmailTemplate = (key: string) =>
  api.post<{
    subject: string;
    html_content: string;
    text_content: string;
    context: Record<string, string>;
  }>(`/users/admin/email-templates/${key}/preview/`, {});

export const sendAdminEmailTemplateTest = (key: string, to_email: string) =>
  api.post(`/users/admin/email-templates/${key}/send-test/`, { to_email });

export const getAdminEmailCampaigns = () =>
  api.get<EmailCampaign[]>('/users/admin/email-campaigns/');

type EmailCampaignWriteData = Partial<EmailCampaign> & {
  attachmentFile?: File | null;
  attachment_clear?: boolean;
};

function buildCampaignPayload(data: EmailCampaignWriteData) {
  const { attachmentFile, attachment_clear, filters, ...rest } = data;
  if (!attachmentFile && !attachment_clear) {
    return filters !== undefined ? { ...rest, filters } : rest;
  }
  const form = new FormData();
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  if (filters !== undefined) form.append('filters', JSON.stringify(filters));
  if (attachmentFile) form.append('attachment', attachmentFile);
  if (attachment_clear) form.append('attachment_clear', 'true');
  return form;
}

export const createAdminEmailCampaign = (data: EmailCampaignWriteData) => {
  const payload = buildCampaignPayload(data);
  return api.post<EmailCampaign>('/users/admin/email-campaigns/', payload, {
    headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

export const getAdminEmailCampaign = (id: number) =>
  api.get<EmailCampaign>(`/users/admin/email-campaigns/${id}/`);

export const updateAdminEmailCampaign = (id: number, data: EmailCampaignWriteData) => {
  const payload = buildCampaignPayload(data);
  return api.patch<EmailCampaign>(`/users/admin/email-campaigns/${id}/`, payload, {
    headers: payload instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : undefined,
  });
};

export const previewAdminEmailCampaignRecipients = (id: number) =>
  api.post<{
    count: number;
    sample: Array<{ enrollment_id: number; email: string; name: string }>;
  }>(`/users/admin/email-campaigns/${id}/preview-recipients/`, {});

export const previewAdminEmailCampaignRecipientsByFilters = (filters: EmailCampaignFilters) =>
  api.post<{
    count: number;
    sample: Array<{ enrollment_id: number; email: string; name: string }>;
  }>('/users/admin/email-campaigns/preview-recipients/', filters);

export const sendAdminEmailCampaignTest = (id: number, to_email: string) =>
  api.post(`/users/admin/email-campaigns/${id}/send-test/`, { to_email });

export const sendAdminEmailCampaignDraftTest = (data: {
  to_email: string;
  subject: string;
  html_content: string;
  text_content?: string;
  filters?: EmailCampaignFilters;
}) =>
  api.post('/users/admin/email-campaigns/send-test-draft/', data);

export const sendAdminEmailCampaign = (id: number) =>
  api.post<{ detail: string; recipient_count: number }>(`/users/admin/email-campaigns/${id}/send/`, {});

export const getAdminFinanceSummary = () =>
  api.get<FinanceGlobalSummary>('/finance/admin/summary/');

export const getAdminFinanceReports = () =>
  api.get<FinanceReportResponse>('/finance/admin/reports/');

export const exportAdminFinanceReportCsv = () =>
  api.get('/finance/admin/reports/export.csv', {
    responseType: 'blob',
  });

export const getFinanceLeaderCandidates = (search?: string) =>
  api.get<{ results: FinanceUserOption[] }>('/finance/admin/leader-candidates/', { params: { search } });

export const getFinanceAreas = () =>
  api.get<FinanceArea[]>('/finance/areas/');

export const createFinanceArea = (data: {
  name: string;
  description?: string;
  allocated_amount: string;
  leader_ids?: number[];
  is_active?: boolean;
}) => api.post<FinanceArea>('/finance/areas/', data);

export const updateFinanceArea = (id: number, data: Partial<{
  name: string;
  description: string;
  allocated_amount: string;
  leader_ids: number[];
  is_active: boolean;
}>) => api.patch<FinanceArea>(`/finance/areas/${id}/`, data);

export const deleteFinanceArea = (id: number) =>
  api.delete(`/finance/areas/${id}/`);

export const getFinanceRubrics = (area?: number) =>
  api.get<FinanceRubric[]>('/finance/rubrics/', { params: area ? { area } : undefined });

export const createFinanceRubric = (data: {
  area: number;
  name: string;
  description?: string;
  allocated_amount: string;
  is_active?: boolean;
}) => api.post<FinanceRubric>('/finance/rubrics/', data);

export const updateFinanceRubric = (id: number, data: Partial<{
  area: number;
  name: string;
  description: string;
  allocated_amount: string;
  is_active: boolean;
}>) => api.patch<FinanceRubric>(`/finance/rubrics/${id}/`, data);

export const deleteFinanceRubric = (id: number) =>
  api.delete(`/finance/rubrics/${id}/`);

export const getFinanceRequests = (params?: {
  area?: number;
  status?: string;
  request_type?: 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT';
}) =>
  api.get<FinanceExpenseRequest[]>('/finance/requests/', { params });

export const createFinanceRequest = (data: {
  rubric: number;
  amount: string;
  request_type: 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT';
  recipient_name: string;
  pix_key: string;
  description: string;
}) => api.post<FinanceExpenseRequest>('/finance/requests/', data);

export const editFinanceRequest = (
  id: number,
  data: { request_type: 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT'; description: string }
) => api.patch<FinanceExpenseRequest>(`/finance/requests/${id}/edit/`, data);

export const reviewFinanceRequest = (id: number, note?: string) =>
  api.post<FinanceExpenseRequest>(`/finance/requests/${id}/review/`, { note });

export const approveFinanceRequest = (id: number) =>
  api.post<FinanceExpenseRequest>(`/finance/requests/${id}/approve/`, {});

export const rejectFinanceRequest = (id: number, rejection_reason: string) =>
  api.post<FinanceExpenseRequest>(`/finance/requests/${id}/reject/`, { rejection_reason });

export const cancelFinanceRequest = (id: number) =>
  api.post<FinanceExpenseRequest>(`/finance/requests/${id}/cancel/`, {});

export const executeFinanceRequest = (
  id: number,
  data: { execution_type: 'ADVANCE' | 'REIMBURSEMENT' | 'DIRECT_PAYMENT'; notes?: string; file?: File | null }
) => {
  const formData = new FormData();
  formData.append('execution_type', data.execution_type);
  if (data.notes) formData.append('notes', data.notes);
  if (data.file) formData.append('file', data.file);
  return api.post<FinanceExpenseRequest>(`/finance/requests/${id}/execute/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const submitFinanceAdvanceSettlement = (
  id: number,
  data: { spent_amount: string; settlement_notes?: string; files?: File[] }
) => {
  const formData = new FormData();
  formData.append('spent_amount', data.spent_amount);
  if (data.settlement_notes) formData.append('settlement_notes', data.settlement_notes);
  data.files?.forEach((file) => formData.append('files', file));
  return api.post<FinanceExpenseRequest>(`/finance/requests/${id}/settlement/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadFinanceAdvanceReturnReceipt = (id: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<FinanceAttachment>(`/finance/requests/${id}/return-receipt/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const confirmFinanceAdvanceReturn = (id: number, note?: string) =>
  api.post<FinanceExpenseRequest>(`/finance/requests/${id}/confirm-return/`, { note });

export const manualCloseFinanceAdvance = (id: number, note: string) =>
  api.post<FinanceExpenseRequest>(`/finance/requests/${id}/manual-close/`, { note });

export const addFinanceRequestAttachment = (id: number, data: { file: File; category?: 'SUPPORTING' | 'RECEIPT' }) => {
  const formData = new FormData();
  formData.append('file', data.file);
  if (data.category) formData.append('category', data.category);
  return api.post<FinanceAttachment>(`/finance/requests/${id}/attachments/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const replaceFinanceRequestAttachment = (requestId: number, attachmentId: number, data: { file: File }) => {
  const formData = new FormData();
  formData.append('file', data.file);
  return api.patch<FinanceAttachment>(`/finance/requests/${requestId}/attachments/${attachmentId}/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteFinanceRequestAttachment = (requestId: number, attachmentId: number) =>
  api.delete(`/finance/requests/${requestId}/attachments/${attachmentId}/`);

export const getMyFinanceDashboard = (params?: { area?: number }) =>
  api.get<FinanceMyDashboardResponse>('/finance/my/dashboard/', { params });

export const getExtraContributions = () =>
  api.get<ExtraContribution[]>('/finance/contributions/');

export const getFinanceSuppliers = (params?: { active?: boolean; search?: string }) =>
  api.get<FinanceSupplier[]>('/finance/suppliers/', { params });

export const createFinanceSupplier = (data: {
  name: string;
  notes?: string;
  is_active?: boolean;
}) => api.post<FinanceSupplier>('/finance/suppliers/', data);

export const updateFinanceSupplier = (
  id: number,
  data: Partial<{ name: string; notes: string; is_active: boolean }>
) => api.patch<FinanceSupplier>(`/finance/suppliers/${id}/`, data);

export const deleteFinanceSupplier = (id: number) =>
  api.delete(`/finance/suppliers/${id}/`);

export const getFinanceSupplierPayments = (params?: {
  month?: string;
  supplier?: number;
  rubric?: number;
  status?: 'PENDING' | 'PAID';
}) => api.get<FinanceSupplierPayment[]>('/finance/supplier-payments/', { params });

export const getFinanceSupplierEligibleRequests = () =>
  api.get<FinanceSupplierEligibleRequest[]>('/finance/supplier-payments/eligible-requests/');

export const createFinanceSupplierPayment = (data: {
  supplier: number;
  expense_request: number;
  amount: string;
  scheduled_date: string;
  notes?: string;
}) => api.post<FinanceSupplierPayment>('/finance/supplier-payments/', data);

export const updateFinanceSupplierPayment = (
  id: number,
  data: Partial<{ supplier: number; amount: string; scheduled_date: string; notes: string }>
) => api.patch<FinanceSupplierPayment>(`/finance/supplier-payments/${id}/`, data);

export const deleteFinanceSupplierPayment = (id: number) =>
  api.delete(`/finance/supplier-payments/${id}/`);

export const markFinanceSupplierPaymentPaid = (id: number, data?: { paid_on?: string }) =>
  api.post<FinanceSupplierPayment>(`/finance/supplier-payments/${id}/mark-paid/`, data || {});

export const createExtraContribution = (data: {
  label: string;
  amount: string;
  source_type: 'OFFERING' | 'INVESTOR' | 'DONATION' | 'OTHER';
  date: string;
  notes?: string;
}) => api.post<ExtraContribution>('/finance/contributions/', data);

export const deleteExtraContribution = (id: number) =>
  api.delete(`/finance/contributions/${id}/`);

export default api;
