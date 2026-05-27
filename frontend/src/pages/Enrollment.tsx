import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, FileText, Calendar, CreditCard, Check, Ticket, X } from 'lucide-react';
import {
  checkEnrollmentCpf,
  getProducts,
  getProduct,
  createEnrollment,
  getSettings,
  validateCoupon,
  type FormFieldConfig,
  type Product,
  type ResponsibleFieldConfig,
} from '../services/api';
import ProgressSteps from '../components/ProgressSteps';

const fixedResponsibleFields = [
  { key: 'nome_responsavel', label: 'Nome do Responsável', type: 'text' as const, placeholder: 'Nome completo do responsável' },
  { key: 'email_responsavel', label: 'Email do Responsável', type: 'email' as const, placeholder: 'responsavel@email.com' },
  { key: 'telefone_responsavel', label: 'Telefone do Responsável', type: 'tel' as const, placeholder: '(11) 99999-9999' },
];

export default function Enrollment() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [enrollmentStartAt, setEnrollmentStartAt] = useState<string | null>(null);
  const [enrollmentEndAt, setEnrollmentEndAt] = useState<string | null>(null);
  
  // Refund policy modal
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentTermAccepted, setConsentTermAccepted] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundPolicyAccepted, setRefundPolicyAccepted] = useState(false);
  const [formFieldsConfig, setFormFieldsConfig] = useState<Record<string, FormFieldConfig>>({});
  const [responsibleFieldsConfig, setResponsibleFieldsConfig] = useState<ResponsibleFieldConfig[]>([]);
  const [minBirthYear, setMinBirthYear] = useState(2009);
  const [maxBirthYear, setMaxBirthYear] = useState<number | null>(null);
  const [cpfDuplicateError, setCpfDuplicateError] = useState('');
  const [validatingCpf, setValidatingCpf] = useState(false);
  const [responsibleFormData, setResponsibleFormData] = useState<Record<string, string | boolean>>({
    nome_responsavel: '',
    email_responsavel: '',
    telefone_responsavel: '',
  });

  const hasActiveBatch = !!selectedProduct?.active_batch;

  const steps = [
    { number: 1, title: 'Dados Pessoais', description: 'Informações básicas' },
    { number: 2, title: 'Pagamento', description: 'Escolha a forma de pagamento' },
    { number: 3, title: 'Confirmação', description: 'Inscrição concluída' },
  ];
  
  const [formData, setFormData] = useState({
    nome_completo: '',
    email: '',
    telefone: '',
    data_nascimento: '',
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
  });

  useEffect(() => {
    loadProducts();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await getSettings();
      setFormFieldsConfig(response.data.form_fields_config);
      setResponsibleFieldsConfig(response.data.responsible_fields_config || []);
      setMinBirthYear(response.data.min_birth_year ?? 2009);
      setMaxBirthYear(response.data.max_birth_year ?? null);
      setEnrollmentStartAt(response.data.enrollment_start_at);
      setEnrollmentEndAt(response.data.enrollment_end_at);
    } catch (err) {
      console.error('Erro ao carregar configurações do formulário:', err);
    }
  };

  const getFieldConfig = (fieldName: string) => formFieldsConfig[fieldName] || {
    enabled: true,
    required: false,
    label: fieldName,
  };

  const loadProducts = async () => {
    try {
      const response = await getProducts();
      const productsList = response.data.results || [];
      if (productsList.length > 0) {
        // Buscar detalhes do primeiro produto para ter o active_batch
        const detailResponse = await getProduct(productsList[0].id);
        setSelectedProduct(detailResponse.data);
      }
    } catch (err: any) {
      console.error('Erro ao carregar produtos:', err);
      setError(err.response?.data?.detail || 'Erro ao carregar produtos. Verifique se o backend está rodando.');
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Digite um código de cupom');
      return;
    }

    if (!selectedProduct || !selectedProduct.active_batch) {
      setCouponError('Selecione um produto primeiro');
      return;
    }

    setValidatingCoupon(true);
    setCouponError('');

    try {
      const baseAmount = parseFloat(String(selectedProduct.active_batch.price));
      
      const response = await validateCoupon({
        code: couponCode.trim().toUpperCase(),
        product_id: selectedProduct.id,
        amount: baseAmount
      });

      setCouponApplied(true);
      setCouponDiscount(response.data.discount_amount);
      setCouponError('');
    } catch (err: any) {
      setCouponError(err.response?.data?.error || 'Cupom inválido');
      setCouponApplied(false);
      setCouponDiscount(0);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setCouponApplied(false);
    setCouponDiscount(0);
    setCouponError('');
  };

  const processEnrollment = async () => {
    setLoading(true);
    setError('');

    if (!selectedProduct || !selectedProduct.active_batch) {
      setError('Não há lote disponível para inscrição no momento.');
      setLoading(false);
      return;
    }

    const now = new Date();
    const startAt = enrollmentStartAt ? new Date(enrollmentStartAt) : null;
    const endAt = enrollmentEndAt ? new Date(enrollmentEndAt) : null;
    if (startAt && now < startAt) {
      setError(`Inscrições iniciam em ${startAt.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}.`);
      setLoading(false);
      return;
    }
    if (endAt && now > endAt) {
      setError('Inscrições encerradas.');
      setLoading(false);
      return;
    }

    // Validate age based on admin configuration.
    if (birthYearError) {
      setError(birthYearError);
      setLoading(false);
      return;
    }

    if (cpfDuplicateError) {
      setError(cpfDuplicateError);
      setLoading(false);
      return;
    }

    try {
      const response = await createEnrollment({
        product_id: selectedProduct.id,
        batch_id: selectedProduct.active_batch.id,
        form_data: {
          ...formData,
          responsavel: responsibleFormData,
        },
        coupon_code: couponApplied ? couponCode : undefined,
      });
      
      // Verificar se temos o ID da inscrição
      if (!response.data || !response.data.id) {
        console.error('Invalid response structure:', response);
        setError('Inscrição criada, mas não foi possível obter o ID. Por favor, verifique em "Minhas Inscrições".');
        setLoading(false);
        return;
      }

      const enrollmentId = response.data.id;
      
      // Redirecionar para página de pagamento
      navigate(`/payment/${enrollmentId}`);
    } catch (err: any) {
      console.error('Error creating enrollment:', err);
      console.error('Error response:', err.response);
      
      // Extrair mensagem de erro mais específica
      let errorMessage = 'Erro ao criar inscrição';
      
      if (err.response?.data) {
        if (err.response.data.detail) {
          errorMessage = err.response.data.detail;
        } else if (err.response.data.batch_id) {
          errorMessage = Array.isArray(err.response.data.batch_id)
            ? err.response.data.batch_id[0]
            : err.response.data.batch_id;
        } else if (err.response.data.form_data) {
          errorMessage = Array.isArray(err.response.data.form_data) 
            ? err.response.data.form_data[0] 
            : err.response.data.form_data;
        } else if (err.response.data.coupon_code) {
          errorMessage = err.response.data.coupon_code;
        } else if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const enrollmentWindowState = (() => {
    const now = new Date();
    const startAt = enrollmentStartAt ? new Date(enrollmentStartAt) : null;
    const endAt = enrollmentEndAt ? new Date(enrollmentEndAt) : null;

    if (startAt && now < startAt) {
      return 'not_started';
    }

    if (endAt && now > endAt) {
      return 'closed';
    }

    return 'open';
  })();

  const enrollmentWindowMessage = (() => {
    if (enrollmentWindowState === 'not_started' && enrollmentStartAt) {
      return `As inscrições começam em ${new Date(enrollmentStartAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}.`;
    }

    if (enrollmentWindowState === 'closed') {
      return 'Inscrições encerradas.';
    }

    return '';
  })();

  const normalizedCpf = formData.cpf.replace(/\D/g, '');

  const birthYearError = (() => {
    if (!formData.data_nascimento) {
      return '';
    }

    const birthDate = new Date(formData.data_nascimento);
    if (Number.isNaN(birthDate.getTime())) {
      return '';
    }

    const birthYear = birthDate.getFullYear();

    if (birthYear < minBirthYear) {
      return `Inscrições disponíveis apenas para nascidos em ${minBirthYear} ou depois.`;
    }

    if (maxBirthYear && birthYear > maxBirthYear) {
      return `Inscrições disponíveis apenas para nascidos em ${maxBirthYear} ou antes.`;
    }

    return '';
  })();

  useEffect(() => {
    if (!selectedProduct || normalizedCpf.length !== 11) {
      setCpfDuplicateError('');
      setValidatingCpf(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setValidatingCpf(true);
        const response = await checkEnrollmentCpf({
          product_id: selectedProduct.id,
          cpf: normalizedCpf,
        });
        setCpfDuplicateError(response.data.exists ? response.data.message : '');
      } catch (err: any) {
        console.error('Erro ao validar CPF da inscrição:', err);
        setCpfDuplicateError('');
      } finally {
        setValidatingCpf(false);
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedCpf, selectedProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentTermAccepted) {
      setShowConsentModal(true);
      return;
    }

    if (!refundPolicyAccepted) {
      setShowRefundModal(true);
      return;
    }
    
    await processEnrollment();
  };

  const renderResponsibleField = (field: ResponsibleFieldConfig) => {
    const commonClassName = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold focus:border-transparent text-gray-900 bg-white';
    const value = responsibleFormData[field.key];

    if (field.type === 'textarea') {
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setResponsibleFormData((current) => ({ ...current, [field.key]: e.target.value }))}
          className={commonClassName}
          placeholder={field.placeholder || field.label}
          rows={4}
          required={field.required}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setResponsibleFormData((current) => ({ ...current, [field.key]: e.target.value }))}
          className={`${commonClassName} appearance-none cursor-pointer`}
          required={field.required}
        >
          <option value="">Selecione...</option>
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
        <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => setResponsibleFormData((current) => ({ ...current, [field.key]: e.target.checked }))}
            className="h-4 w-4"
          />
          <span className="text-sm text-gray-700">{field.placeholder || field.label}</span>
        </label>
      );
    }

    const inputTypeMap: Record<string, string> = {
      text: 'text',
      email: 'email',
      phone: 'tel',
      cpf: 'text',
      date: 'date',
    };

    return (
      <input
        type={inputTypeMap[field.type] || 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => setResponsibleFormData((current) => ({ ...current, [field.key]: e.target.value }))}
        className={commonClassName}
        placeholder={field.type === 'date' ? '' : field.placeholder || field.label}
        required={field.required}
      />
    );
  };

  const backButtonClass = 'flex items-center mb-8 font-medium text-dark transition-colors hover:text-gold-700';
  const inputClass = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold focus:border-transparent text-gray-900 bg-white';
  const selectClass = `${inputClass} appearance-none cursor-pointer`;
  const primaryButtonClass = 'px-6 py-3 bg-dark text-white rounded-lg font-medium hover:bg-dark-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  if (enrollmentWindowState !== 'open') {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <button
            onClick={() => navigate('/')}
            className={backButtonClass}
          >
            <ArrowLeft className="w-5 h-5 mr-2" style={{ color: 'inherit' }} />
            Voltar
          </button>

          <div className="bg-white rounded-xl shadow-lg p-8 mt-8 text-center">
            <h1 className="text-3xl font-bold mb-3">
              {enrollmentWindowState === 'not_started' ? 'Inscrições em breve' : 'Inscrições encerradas'}
            </h1>
            <p className="text-lg text-gray-600">
              {enrollmentWindowMessage || 'Não há inscrições disponíveis neste momento.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <button
          onClick={() => navigate('/')}
          className={backButtonClass}
        >
          <ArrowLeft className="w-5 h-5 mr-2" style={{ color: 'inherit' }} />
          Voltar
        </button>

        {/* Progress Steps */}
        <ProgressSteps currentStep={1} steps={steps} />

        <div className="bg-white rounded-xl shadow-lg p-8 mt-8">
          <h1 className="text-3xl font-bold mb-2">Dados Pessoais</h1>
          <p className="text-gray-600 mb-8">
            Preencha seus dados para continuar com a inscrição
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* Produto Selecionado */}
          {selectedProduct && (
            <div className="mb-8 rounded-lg border border-gold/30 bg-gold/10 p-6">
              <h3 className="font-semibold text-lg mb-2">
                {selectedProduct.name}
              </h3>
              <p className="text-gray-700 mb-4">{selectedProduct.description}</p>
              
              {selectedProduct.active_batch && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Lote:</span>
                    <span className="font-semibold ml-2">
                      {selectedProduct.active_batch.name}
                    </span>
                  </div>
                </div>
              )}

              {!selectedProduct.active_batch && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Lote esgotado ou indisponível no momento. Tente novamente mais tarde.
                </div>
              )}
            </div>
          )}

          {/* Formulário */}
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            {getFieldConfig('nome_completo').enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Nome Completo {getFieldConfig('nome_completo').required ? '*' : ''}
              </label>
              <input
                type="text"
                required={getFieldConfig('nome_completo').required}
                value={formData.nome_completo}
                onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                className={inputClass}
                placeholder="Seu nome completo"
              />
            </div>
            )}

            {getFieldConfig('email').enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email {getFieldConfig('email').required ? '*' : ''}
              </label>
              <input
                type="email"
                required={getFieldConfig('email').required}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputClass}
                placeholder="seu@email.com"
              />
            </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              {getFieldConfig('telefone').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Telefone {getFieldConfig('telefone').required ? '*' : ''}
                </label>
                <input
                  type="tel"
                  required={getFieldConfig('telefone').required}
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className={inputClass}
                  placeholder="(11) 99999-9999"
                />
              </div>
              )}

              {getFieldConfig('data_nascimento').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Data de Nascimento {getFieldConfig('data_nascimento').required ? '*' : ''}
                </label>
                <input
                  type="date"
                  required={getFieldConfig('data_nascimento').required}
                  value={formData.data_nascimento}
                  onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                  className={`${inputClass} ${birthYearError ? 'border-red-400 focus:ring-red-300' : ''}`}
                />
                {birthYearError && (
                  <p className="mt-2 text-sm text-red-600">{birthYearError}</p>
                )}
              </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {getFieldConfig('cpf').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-2" />
                  CPF {getFieldConfig('cpf').required ? '*' : ''}
                </label>
                <input
                  type="text"
                  required={getFieldConfig('cpf').required}
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className={`${inputClass} ${cpfDuplicateError ? 'border-red-400 focus:ring-red-300' : ''}`}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {validatingCpf && normalizedCpf.length === 11 && (
                  <p className="mt-2 text-sm text-gray-500">Validando CPF...</p>
                )}
                {cpfDuplicateError && (
                  <p className="mt-2 text-sm text-red-600">{cpfDuplicateError}</p>
                )}
              </div>
              )}

              {getFieldConfig('rg').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <CreditCard className="w-4 h-4 inline mr-2" />
                  RG {getFieldConfig('rg').required ? '*' : ''}
                </label>
                <input
                  type="text"
                  required={getFieldConfig('rg').required}
                  value={formData.rg}
                  onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                  className={inputClass}
                  placeholder="00.000.000-0"
                />
              </div>
              )}
            </div>

            {getFieldConfig('cep').enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CEP {getFieldConfig('cep').required ? '*' : ''}
              </label>
              <input
                type="text"
                required={getFieldConfig('cep').required}
                value={formData.cep}
                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                className={inputClass}
                placeholder="00000-000"
                maxLength={9}
              />
            </div>
            )}

            {getFieldConfig('tamanho_camiseta').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tamanho da Camiseta {getFieldConfig('tamanho_camiseta').required ? '*' : ''}
                </label>
                <select
                  required={getFieldConfig('tamanho_camiseta').required}
                  value={formData.tamanho_camiseta}
                  onChange={(e) => setFormData({ ...formData, tamanho_camiseta: e.target.value })}
                  className={selectClass}
                  style={{ backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e')", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                >
                  <option value="">Selecione o tamanho...</option>
                  <option value="PP">PP</option>
                  <option value="P">P</option>
                  <option value="M">M</option>
                  <option value="G">G</option>
                  <option value="GG">GG</option>
                  <option value="XG">XG</option>
                </select>
              </div>
            )}
            
            <div className="border-t pt-6 mt-6">
              <h3 className="mb-4 text-lg font-semibold text-dark">
              </h3>
              
              {getFieldConfig('membro_batista_capital').enabled && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Você é membro da Batista Capital? {getFieldConfig('membro_batista_capital').required ? '*' : ''}
                </label>
                <select
                  required={getFieldConfig('membro_batista_capital').required}
                  value={formData.membro_batista_capital}
                  onChange={(e) => setFormData({ ...formData, membro_batista_capital: e.target.value })}
                  className={selectClass}
                  style={{ backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e')", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                >
                  <option value="">Selecione...</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              )}

              {getFieldConfig('igreja').enabled && formData.membro_batista_capital === 'nao' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Qual sua igreja? {getFieldConfig('igreja').required ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    required={getFieldConfig('igreja').required}
                    value={formData.igreja}
                    onChange={(e) => setFormData({ ...formData, igreja: e.target.value })}
                    className={inputClass}
                    placeholder="Nome da sua igreja"
                  />
                </div>
              )}

              {getFieldConfig('lider_pg').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quem é seu líder de PG? {getFieldConfig('lider_pg').required ? '*' : ''}
                </label>
                <input
                  type="text"
                  required={getFieldConfig('lider_pg').required}
                  value={formData.lider_pg}
                  onChange={(e) => setFormData({ ...formData, lider_pg: e.target.value })}
                  className={inputClass}
                  placeholder="Digite o nome do seu líder de PG"
                />
              </div>
              )}

              {getFieldConfig('ja_participou_zion').enabled && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Você já participou do ZION? {getFieldConfig('ja_participou_zion').required ? '*' : ''}
                </label>
                <select
                  required={getFieldConfig('ja_participou_zion').required}
                  value={formData.ja_participou_zion}
                  onChange={(e) => setFormData({ ...formData, ja_participou_zion: e.target.value, imperio_zion: e.target.value === 'sim' ? formData.imperio_zion : '' })}
                  className={selectClass}
                  style={{ backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e')", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                >
                  <option value="">Selecione...</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              )}

              {getFieldConfig('imperio_zion').enabled && formData.ja_participou_zion === 'sim' && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Qual o seu império? {getFieldConfig('imperio_zion').required ? '*' : ''}
                </label>
                <select
                  required={getFieldConfig('imperio_zion').required}
                  value={formData.imperio_zion}
                  onChange={(e) => setFormData({ ...formData, imperio_zion: e.target.value })}
                  className={selectClass}
                  style={{ backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e')", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                >
                  <option value="">Selecione o império...</option>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observações Adicionais {getFieldConfig('observacoes').required ? '*' : ''}
              </label>
              <textarea
                required={getFieldConfig('observacoes').required}
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={4}
                className={inputClass}
                placeholder="Restrições alimentares, necessidades especiais, etc..."
              />
            </div>
            )}

            <div className="border-t pt-6 mt-6">
              <h3 className="mb-4 text-lg font-semibold text-dark">
                Dados do Responsável
              </h3>
              <div className="grid gap-6 md:grid-cols-2">
                {fixedResponsibleFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.label} *
                    </label>
                    <input
                      type={field.type}
                      value={typeof responsibleFormData[field.key] === 'string' ? String(responsibleFormData[field.key]) : ''}
                      onChange={(e) => setResponsibleFormData((current) => ({ ...current, [field.key]: e.target.value }))}
                      className={inputClass}
                      placeholder={field.placeholder}
                      required
                    />
                  </div>
                ))}
                {responsibleFieldsConfig.map((field) => (
                  <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    {field.type !== 'checkbox' && (
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label} {field.required ? '*' : ''}
                      </label>
                    )}
                    {renderResponsibleField(field)}
                  </div>
                ))}
              </div>
            </div>

            {/* Cupom de Desconto */}
            <div className="border-t pt-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                <Ticket className="w-4 h-4 inline mr-2" />
                Tem um cupom de desconto?
              </label>
              
              {!couponApplied ? (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Digite o código do cupom"
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 uppercase text-gray-900 focus:border-transparent focus:ring-2 focus:ring-gold"
                    disabled={validatingCoupon}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={validatingCoupon || !couponCode.trim()}
                    className={primaryButtonClass}
                  >
                    {validatingCoupon ? 'Validando...' : 'Aplicar'}
                  </button>
                </div>
              ) : (
                <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-900">Cupom aplicado!</p>
                        <p className="text-sm text-green-700">
                          Código: <span className="font-mono font-bold">{couponCode}</span>
                        </p>
                        <p className="text-sm text-green-700">
                          Desconto: <span className="font-bold">R$ {couponDiscount.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Remover cupom"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
              
              {couponError && (
                <p className="mt-2 text-sm text-red-600">{couponError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !hasActiveBatch || Boolean(birthYearError) || Boolean(cpfDuplicateError) || validatingCpf}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processando...' : hasActiveBatch ? 'Continuar para Pagamento' : 'Sem lote disponível'}
            </button>
          </form>
        </div>
      </div>

      {/* Consent Term Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-dark">
                  Termo de Consentimento
                </h2>
                <button
                  onClick={() => setShowConsentModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-5 text-gray-700">
                <p>
                  A participação no Acampamento ZION implica ciência e concordância com os termos abaixo.
                </p>

                <div className="space-y-4 rounded-lg bg-gray-50 p-4">
                  <div>
                    <p className="font-semibold text-dark">1. Termo de Responsabilidade</p>
                    <p className="mt-1 text-sm">
                      Ao realizar a inscrição no evento, o participante declara estar ciente e de acordo com as normas e regulamentos estabelecidos pela organização do evento, realizado pela Igreja Batista Capital. O participante assume total responsabilidade por sua participação no evento, isentando a Igreja Batista Capital e seus organizadores de qualquer responsabilidade por eventuais acidentes ou incidentes que possam ocorrer, bem como por quaisquer danos materiais ou pessoais causados a terceiros.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">2. Utilização de Imagem</p>
                    <p className="mt-1 text-sm">
                      O participante autoriza a Igreja Batista Capital a utilizar sua imagem, voz e/ou nome capturados durante o evento em materiais promocionais, institucionais, publicitários e informativos, sem remuneração ou compensação financeira.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">3. Tratamento de Dados Pessoais (LGPD)</p>
                    <p className="mt-1 text-sm">
                      O participante autoriza o tratamento dos dados pessoais fornecidos para gestão e organização do evento, comunicação sobre o ZION e divulgação de futuras ações e eventos da Igreja Batista Capital, nos termos da Lei nº 13.709/2018.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">4. Restrições Alimentares e de Saúde</p>
                    <p className="mt-1 text-sm">
                      O participante ou seu responsável legal deve informar à liderança do evento, por meio de documento, quaisquer restrições alimentares, condições médicas ou limitações físicas. Caso necessário, deve ser providenciado atestado médico.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">5. Objetos de Valor</p>
                    <p className="mt-1 text-sm">
                      Quaisquer objetos de valor que estiverem em posse do participante são de sua total responsabilidade. A Igreja Batista Capital não se responsabiliza por perdas, furtos ou danos.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">6. Danos Materiais</p>
                    <p className="mt-1 text-sm">
                      O participante assume responsabilidade por danos materiais causados ao patrimônio do CNTI, da organização do evento ou de terceiros, desde que sua responsabilidade seja comprovada.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">7. Comportamento Inadequado</p>
                    <p className="mt-1 text-sm">
                      A liderança poderá aplicar advertências, comunicar os responsáveis legais e, em situações graves, excluir o participante do evento. Caso seja necessário retorno antecipado, os responsáveis legais deverão providenciar o transporte, sem direito a reembolso.
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">8. Regras do Acampamento</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                      <li>Respeitar os líderes e a equipe organizadora.</li>
                      <li>É proibido qualquer tipo de namoro durante o acampamento.</li>
                      <li>Não é permitido entrar nos quartos do sexo oposto.</li>
                      <li>É proibido circular sozinho pela chácara; sempre esteja acompanhado.</li>
                      <li>Respeitar os horários estabelecidos para atividades, refeições e descanso.</li>
                      <li>É proibido portar objetos cortantes, armas ou itens perigosos.</li>
                      <li>É proibido o consumo ou posse de bebidas alcoólicas, cigarros e cigarros eletrônicos.</li>
                      <li>O uso de celular é proibido durante o evento, salvo em casos de emergência.</li>
                      <li>Vestimentas devem ser adequadas ao ambiente do acampamento.</li>
                      <li>Brigas e atos de desrespeito entre participantes não serão tolerados.</li>
                      <li>É proibido sair do local sem autorização da liderança.</li>
                      <li>O participante deve manter a organização e limpeza dos espaços compartilhados.</li>
                      <li>Todo lixo deve ser descartado corretamente nos locais indicados.</li>
                      <li>A participação em todas as atividades programadas é obrigatória, salvo motivo de saúde informado previamente.</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-dark">9. Informações Importantes</p>
                    <p className="mt-1 text-sm">
                      Data do evento: 24 a 26 de julho de 2026<br />
                      Local: CNTI<br />
                      Contato: contatojumpcapital@gmail.com | (61) 99962-6171 (Ana Clara)
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={() => {
                    setConsentTermAccepted(true);
                    setShowConsentModal(false);
                    if (!refundPolicyAccepted) {
                      setShowRefundModal(true);
                    }
                  }}
                  className={`w-full ${primaryButtonClass}`}
                >
                  Aceito o Termo de Consentimento
                </button>
                <button
                  onClick={() => setShowConsentModal(false)}
                  className="w-full rounded-lg bg-gray-200 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Policy Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-dark">
                  Política de Reembolso
                </h2>
                <button
                  onClick={() => setShowRefundModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 text-gray-700">
                <p className="font-semibold text-lg">
                  O jovem tem o direito de solicitar reembolso nas seguintes condições:
                </p>

                <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gold/20 text-dark text-sm font-semibold">
                      1
                    </span>
                    <p>
                      O reembolso será concedido <strong>em 100% do valor pago</strong>, com até <strong>1 mês</strong> antes do evento, <em>descontando taxas</em>.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gold/20 text-dark text-sm font-semibold">
                      2
                    </span>
                    <p>
                      O reembolso será de <strong>50% do valor pago</strong>, com até <strong>1 semana</strong> antes do evento, <em>descontando taxas</em>.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gold/20 text-dark text-sm font-semibold">
                      3
                    </span>
                    <p>
                      Não será concedido reembolso com <strong>menos de 1 semana</strong> para o evento.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={async () => {
                    setRefundPolicyAccepted(true);
                    setShowRefundModal(false);
                    // Process enrollment after accepting policy
                    await processEnrollment();
                  }}
                  className={`w-full ${primaryButtonClass}`}
                >
                  Aceito os Termos de Reembolso
                </button>
                <button
                  onClick={() => setShowRefundModal(false)}
                  className="w-full py-3 px-6 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold text-gray-700 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
