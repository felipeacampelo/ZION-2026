import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, Phone, Calendar, CreditCard, Ticket, Check, X } from 'lucide-react';
import { getEnrollment, getSettings, updateEnrollment, validateCoupon, type Enrollment, type FormFieldConfig } from '../services/api';

export default function EditEnrollment() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  
  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [hasCoupon, setHasCoupon] = useState(false);
  const [hasConfirmedPayments, setHasConfirmedPayments] = useState(false);
  const [formFieldsConfig, setFormFieldsConfig] = useState<Record<string, FormFieldConfig>>({});
  
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
    observacoes: '',
  });

  useEffect(() => {
    loadEnrollment();
    loadFormSettings();
  }, [id]);

  const getFieldConfig = (fieldName: string) => {
    if (formFieldsConfig[fieldName]) {
      return formFieldsConfig[fieldName];
    }

    if (fieldName === 'tamanho_camiseta') {
      return { enabled: false, required: false, label: 'Tamanho da Camiseta' };
    }

    return { enabled: true, required: true, label: fieldName };
  };

  const loadFormSettings = async () => {
    try {
      const response = await getSettings();
      setFormFieldsConfig(response.data.form_fields_config || {});
    } catch (err) {
      console.error('Erro ao carregar configurações do formulário:', err);
    }
  };

  const loadEnrollment = async () => {
    try {
      const response = await getEnrollment(Number(id));
      const enrollmentData = response.data;
      setEnrollment(enrollmentData);
      
      // Check if enrollment already has a coupon
      if (enrollmentData.discount_amount && parseFloat(enrollmentData.discount_amount) > 0) {
        setHasCoupon(true);
        setCouponDiscount(parseFloat(enrollmentData.discount_amount));
      }
      
      // Check if enrollment has confirmed payments
      const hasConfirmed = enrollmentData.payments?.some(
        (p: any) => p.status === 'CONFIRMED' || p.status === 'RECEIVED'
      ) || false;
      setHasConfirmedPayments(hasConfirmed);
      
      // Preencher formulário com dados existentes
      if (enrollmentData.form_data) {
        setFormData({
          nome_completo: enrollmentData.form_data.nome_completo || '',
          email: enrollmentData.form_data.email || '',
          telefone: enrollmentData.form_data.telefone || '',
          data_nascimento: enrollmentData.form_data.data_nascimento || '',
          cpf: enrollmentData.form_data.cpf || '',
          rg: enrollmentData.form_data.rg || '',
          cep: enrollmentData.form_data.cep || '',
          tamanho_camiseta: enrollmentData.form_data.tamanho_camiseta || '',
          membro_batista_capital: enrollmentData.form_data.membro_batista_capital || '',
          igreja: enrollmentData.form_data.igreja || '',
          lider_pg: enrollmentData.form_data.lider_pg || '',
          observacoes: enrollmentData.form_data.observacoes || '',
        });
      }
      
      setLoading(false);
    } catch (err: any) {
      console.error('Erro ao carregar inscrição:', err);
      setError('Erro ao carregar dados da inscrição');
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Digite um código de cupom');
      return;
    }

    if (!enrollment || !enrollment.product) {
      setCouponError('Erro ao carregar dados da inscrição');
      return;
    }

    setValidatingCoupon(true);
    setCouponError('');

    try {
      const baseAmount = parseFloat(String(enrollment.batch?.price || enrollment.total_amount || 0));
      
      const response = await validateCoupon({
        code: couponCode.trim().toUpperCase(),
        product_id: enrollment.product.id,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const updateData: any = hasConfirmedPayments
        ? { form_data: { observacoes: formData.observacoes } }
        : { form_data: formData };
      
      // Add coupon if applied
      if (couponApplied && couponCode) {
        updateData.coupon_code = couponCode.trim().toUpperCase();
      }
      
      await updateEnrollment(Number(id), updateData);
      setSuccess('Dados atualizados com sucesso!');
      setTimeout(() => navigate('/minhas-inscricoes'), 2000);
    } catch (err: any) {
      console.error('Erro ao atualizar:', err);
      setError(err.response?.data?.detail || 'Erro ao atualizar dados');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !formData.nome_completo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <button
          onClick={() => navigate('/minhas-inscricoes')}
          className="flex items-center mb-8 font-medium transition-colors"
          style={{ color: 'rgb(165, 44, 240)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'rgb(145, 24, 220)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgb(165, 44, 240)'}
        >
          <ArrowLeft className="w-5 h-5 mr-2" style={{ color: 'inherit' }} />
          Voltar para Minhas Inscrições
        </button>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-2">Editar Inscrição</h1>
          <p className="text-gray-600 mb-8">
            {hasConfirmedPayments 
              ? 'Apenas o campo de observações pode ser editado após pagamento confirmado'
              : 'Atualize seus dados pessoais'}
          </p>
          
          {hasConfirmedPayments && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg mb-6">
              ℹ️ Esta inscrição possui pagamentos confirmados. Apenas o campo de observações pode ser editado.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Nome Completo *
              </label>
              <input
                type="text"
                required
                value={formData.nome_completo}
                onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                disabled={hasConfirmedPayments}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                disabled={hasConfirmedPayments}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Telefone *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  disabled={hasConfirmedPayments}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Data de Nascimento *
                </label>
                <input
                  type="date"
                  required
                  value={formData.data_nascimento}
                  onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  disabled={hasConfirmedPayments}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CPF *
                </label>
                <input
                  type="text"
                  required
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  maxLength={14}
                  disabled={hasConfirmedPayments}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <CreditCard className="w-4 h-4 inline mr-2" />
                  RG *
                </label>
                <input
                  type="text"
                  required
                  value={formData.rg}
                  onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  disabled={hasConfirmedPayments}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CEP *
              </label>
              <input
                type="text"
                required
                value={formData.cep}
                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                maxLength={9}
                disabled={hasConfirmedPayments}
              />
            </div>

            {getFieldConfig('tamanho_camiseta').enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tamanho da Camiseta {getFieldConfig('tamanho_camiseta').required ? '*' : ''}
                </label>
                <select
                  required={getFieldConfig('tamanho_camiseta').required}
                  value={formData.tamanho_camiseta}
                  onChange={(e) => setFormData({ ...formData, tamanho_camiseta: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  disabled={hasConfirmedPayments}
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
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Você é membro da Batista Capital? *
                </label>
                <select
                  required
                  value={formData.membro_batista_capital}
                  onChange={(e) => setFormData({ ...formData, membro_batista_capital: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  disabled={hasConfirmedPayments}
                >
                  <option value="">Selecione...</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>

              {formData.membro_batista_capital === 'nao' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Qual sua igreja? *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.igreja}
                    onChange={(e) => setFormData({ ...formData, igreja: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                    disabled={hasConfirmedPayments}
                  />
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Líder de PG
                </label>
                <input
                  type="text"
                  value={formData.lider_pg}
                  onChange={(e) => setFormData({ ...formData, lider_pg: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                  disabled={hasConfirmedPayments}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Observações
                </label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple focus:border-transparent text-gray-900 bg-white"
                />
              </div>
            </div>

            {/* Cupom de Desconto */}
            {!hasCoupon && !hasConfirmedPayments && (
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
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-gray-900 bg-white uppercase"
                      disabled={validatingCoupon}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={validatingCoupon || !couponCode.trim()}
                      className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            )}

            {hasCoupon && (
              <div className="border-t pt-6">
                <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">Cupom já aplicado nesta inscrição</p>
                      <p className="text-sm text-green-700">
                        Desconto: <span className="font-bold">R$ {couponDiscount.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate('/minhas-inscricoes')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 btn-primary"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
