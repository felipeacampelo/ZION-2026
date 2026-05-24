import axios from 'axios';

// API base URL: configurable via environment (VITE_API_URL) for Railway/production
// Falls back to localhost for local development
export const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api';

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
  created_at: string;
  paid_at?: string | null;
  payments?: Payment[];
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

export interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  html_content: string;
  text_content: string;
  filters: {
    product?: number;
    status?: string;
    payment_method?: string;
    search?: string;
    enrollment_ids?: number[];
  };
  status: 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED' | 'PARTIAL';
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  test_email: string;
  started_at: string | null;
  finished_at: string | null;
  created_by: number | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  recipients: EmailCampaignRecipient[];
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

export const getAdminEnrollments = (params?: {
  status?: string;
  product?: number;
  search?: string;
  payment_method?: string;
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
}

export const getSettings = () => api.get<AppSettings>('/enrollments/settings/');
export const getAdminSettings = () => api.get<AppSettings>('/users/admin/settings/');
export const updateAdminSettings = (data: Partial<AppSettings>) =>
  api.patch<AppSettings>('/users/admin/settings/', data);

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

export const createAdminEmailCampaign = (data: Partial<EmailCampaign>) =>
  api.post<EmailCampaign>('/users/admin/email-campaigns/', data);

export const getAdminEmailCampaign = (id: number) =>
  api.get<EmailCampaign>(`/users/admin/email-campaigns/${id}/`);

export const updateAdminEmailCampaign = (id: number, data: Partial<EmailCampaign>) =>
  api.patch<EmailCampaign>(`/users/admin/email-campaigns/${id}/`, data);

export const previewAdminEmailCampaignRecipients = (id: number) =>
  api.post<{
    count: number;
    sample: Array<{ enrollment_id: number; email: string; name: string }>;
  }>(`/users/admin/email-campaigns/${id}/preview-recipients/`, {});

export const previewAdminEmailCampaignRecipientsByFilters = (filters: {
  product?: number;
  status?: string;
  payment_method?: string;
  search?: string;
  enrollment_ids?: number[];
}) =>
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
  filters?: {
    product?: number;
    status?: string;
    payment_method?: string;
    search?: string;
    enrollment_ids?: number[];
  };
}) =>
  api.post('/users/admin/email-campaigns/send-test-draft/', data);

export const sendAdminEmailCampaign = (id: number) =>
  api.post<{ detail: string; recipient_count: number }>(`/users/admin/email-campaigns/${id}/send/`, {});

export default api;
