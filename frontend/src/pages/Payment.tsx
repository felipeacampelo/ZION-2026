import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, QrCode, CreditCard as CreditCardIcon } from 'lucide-react';
import { getEnrollment, createPayment, type Enrollment, type Payment } from '../services/api';
import ProgressSteps from '../components/ProgressSteps';
import CreditCardForm, { type CardData } from '../components/CreditCardForm';

export default function PaymentPage() {
  console.log('PaymentPage component loaded');
  const navigate = useNavigate();
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const [searchParams] = useSearchParams();
  const hasLoadedRef = useRef(false);
  
  const paymentIdFromUrl = searchParams.get('paymentId');
  
  console.log('enrollmentId:', enrollmentId);
  console.log('paymentId from URL:', paymentIdFromUrl);
  
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentLoaded, setPaymentLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [paymentMethod, setPaymentMethod] = useState<'PIX_CASH' | 'PIX_INSTALLMENT' | 'CREDIT_CARD'>('PIX_CASH');
  const [installments, setInstallments] = useState(1);
  const [showCardForm, setShowCardForm] = useState(false);
  
  // Calculate prices based on batch and discount
  const batchPixCashPrice = enrollment?.batch?.price ? parseFloat(String(enrollment.batch.price)) : 0;
  const batchPixInstallmentPrice = enrollment?.batch?.pix_installment_price ? parseFloat(String(enrollment.batch.pix_installment_price)) : 0;
  const batchCreditCardPrice = enrollment?.batch?.credit_card_price ? parseFloat(String(enrollment.batch.credit_card_price)) : 0;
  
  // Get discount amount from enrollment
  const discountAmount = enrollment?.discount_amount ? parseFloat(String(enrollment.discount_amount)) : 0;
  const hasDiscount = discountAmount > 0;
  
  // Apply discount to each payment method price
  const pixCashPrice = Math.max(0, batchPixCashPrice - discountAmount);
  const pixInstallmentPrice = Math.max(0, batchPixInstallmentPrice - discountAmount);
  const creditCardPrice = Math.max(0, batchCreditCardPrice - discountAmount);

  const steps = [
    { number: 1, title: 'Dados Pessoais', description: 'Informações básicas' },
    { number: 2, title: 'Pagamento', description: 'Escolha a forma de pagamento' },
    { number: 3, title: 'Confirmação', description: 'Inscrição concluída' },
  ];

  const getPaymentErrorMessage = (err: any) => {
    const data = err?.response?.data;

    if (!data) {
      return err?.message || 'Erro ao criar pagamento';
    }

    if (typeof data === 'string') {
      return data;
    }

    if (data.error) {
      return Array.isArray(data.error) ? data.error[0] : data.error;
    }

    if (data.detail) {
      return Array.isArray(data.detail) ? data.detail[0] : data.detail;
    }

    const fieldPriority = ['enrollment_id', 'installments', 'credit_card', 'payment_method'];

    for (const field of fieldPriority) {
      if (data[field]) {
        return Array.isArray(data[field]) ? data[field][0] : data[field];
      }
    }

    const firstValue = Object.values(data)[0];
    if (typeof firstValue === 'string') {
      return firstValue;
    }

    if (Array.isArray(firstValue) && firstValue.length > 0) {
      return String(firstValue[0]);
    }

    return err?.message || 'Erro ao criar pagamento';
  };

  useEffect(() => {
    if (enrollmentId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      
      (async () => {
        try {
          const response = await getEnrollment(Number(enrollmentId));
          setEnrollment(response.data);
          
          if (response.data.payments && response.data.payments.length > 0) {
            let selectedPayment = response.data.payments[0];
            
            // Check if specific payment was selected from URL
            if (paymentIdFromUrl) {
              // Find payment by ID from URL
              selectedPayment = response.data.payments.find((p: any) => p.id === Number(paymentIdFromUrl)) || response.data.payments[0];
            }
            
            console.log('Selected payment (FINAL):', selectedPayment);
            setPayment(selectedPayment);
          }
        } catch (err) {
          console.error('Error loading enrollment:', err);
        }
      })();
    }
  }, [enrollmentId, paymentIdFromUrl]);


  // Poll payment status when payment exists and is not confirmed
  useEffect(() => {
    if (!payment || payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await getEnrollment(Number(enrollmentId));
        
        // Update enrollment data
        setEnrollment(response.data);
        
        // Find the SAME payment by ID, not just the first one
        const updatedPayment = response.data.payments?.find((p: any) => p.id === payment.id);
        
        if (updatedPayment) {
          console.log('Polling - Updated payment:', updatedPayment);
          // Update payment to get latest status
          setPayment(updatedPayment);
          
          if (updatedPayment.status === 'CONFIRMED' || updatedPayment.status === 'RECEIVED') {
            console.log('Payment confirmed! Stopping polling.');
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [payment?.id, enrollmentId]);

  const loadEnrollment = async () => {
    try {
      const response = await getEnrollment(Number(enrollmentId));
      setEnrollment(response.data);
      // If payment is already confirmed, don't reset it
      if (payment && (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED')) {
        return;
      }
    } catch (err) {
      setError('Erro ao carregar inscrição');
    }
  };

  const handleCreatePayment = async () => {
    if (!enrollmentId) return;

    // Se for cartão, mostrar formulário
    if (paymentMethod === 'CREDIT_CARD') {
      setShowCardForm(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await createPayment({
        enrollment_id: Number(enrollmentId),
        payment_method: paymentMethod,
        installments: paymentMethod === 'PIX_CASH' ? 1 : installments,
      });

      setPayment(response.data);
      // Mark payment as loaded to prevent overwriting
      setPaymentLoaded(true);
    } catch (err: any) {
      setError(getPaymentErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCardSubmit = async (cardData: CardData) => {
    if (!enrollmentId) return;

    setLoading(true);
    setError('');

    try {
      // Enviar dados do cartão para o backend tokenizar
      // O backend vai tokenizar de forma segura com a API do Asaas
      const response = await createPayment({
        enrollment_id: Number(enrollmentId),
        payment_method: 'CREDIT_CARD',
        installments,
        credit_card_data: {
          number: cardData.number.replace(/\s/g, ''),
          holderName: cardData.holderName,
          expiryMonth: cardData.expiryMonth,
          expiryYear: cardData.expiryYear,
          ccv: cardData.ccv,
        },
      });

      setPayment(response.data);
      // Mark payment as loaded to prevent overwriting
      setPaymentLoaded(true);
    } catch (err: any) {
      setError(getPaymentErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = () => {
    if ((payment as any)?.pix_copy_paste) {
      navigator.clipboard.writeText((payment as any).pix_copy_paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Botão Voltar */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center mb-6 font-medium transition-colors"
          style={{ color: 'rgb(165, 44, 240)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'rgb(145, 24, 220)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'rgb(165, 44, 240)'}
        >
          <ArrowLeft className="w-5 h-5 mr-2" style={{ color: 'inherit' }} />
          Voltar
        </button>

        {/* Progress Steps */}
        <ProgressSteps currentStep={payment ? 3 : 2} steps={steps} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 mt-8">
            {error}
          </div>
        )}

        {!payment ? (
          /* Seleção de Pagamento */
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 mt-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Forma de Pagamento</h1>
            <p className="text-gray-600 mb-8">
              Escolha como deseja pagar sua inscrição
            </p>

            {enrollment && (
              <div className="rounded-lg p-4 sm:p-6 mb-8" style={{ backgroundColor: 'rgba(165, 44, 240, 0.05)', border: '1px solid rgba(165, 44, 240, 0.2)' }}>
                <h3 className="font-semibold text-lg mb-4">Resumo da Inscrição</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <span className="text-gray-600">Produto:</span>
                    <span className="font-semibold mt-1 sm:mt-0">{enrollment.product?.name}</span>
                  </div>
                  {hasDiscount && (
                    <>
                      <div className="flex flex-col sm:flex-row sm:justify-between">
                        <span className="text-gray-600">Valor Original:</span>
                        <span className="font-semibold mt-1 sm:mt-0 line-through text-gray-400">R$ {batchPixCashPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:justify-between">
                        <span className="text-gray-600">Desconto do Cupom:</span>
                        <span className="font-semibold mt-1 sm:mt-0 text-green-600">- R$ {discountAmount.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <span className="text-gray-600">{hasDiscount ? 'Valor com Desconto:' : 'Valor Total:'}</span>
                    <span className="font-semibold mt-1 sm:mt-0">
                      R$ {parseFloat(enrollment.final_amount || '0').toFixed(2)}
                      {hasDiscount && <span className="ml-2 text-xs text-green-600 font-normal">(cupom aplicado)</span>}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Opções de Pagamento */}
            <div className="space-y-4 mb-8">
              {/* PIX à Vista */}
              <div
                onClick={() => {
                  setPaymentMethod('PIX_CASH');
                  setInstallments(1);
                }}
                className="border-2 rounded-lg p-4 sm:p-6 cursor-pointer transition-all"
                style={{
                  borderColor: paymentMethod === 'PIX_CASH' ? 'rgb(165, 44, 240)' : '#e5e7eb',
                  backgroundColor: paymentMethod === 'PIX_CASH' ? 'rgba(165, 44, 240, 0.05)' : 'transparent'
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center">
                    <QrCode className="w-6 h-6 mr-3 flex-shrink-0" style={{ color: 'rgb(165, 44, 240)' }} />
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg">PIX à Vista</h3>
                      <p className="text-xs sm:text-sm text-gray-600">Pagamento único</p>
                    </div>
                  </div>
                  {enrollment && (
                    <div className="text-left sm:text-right">
                      {hasDiscount && (
                        <div className="text-sm text-gray-400 line-through">
                          R$ {batchPixCashPrice.toFixed(2)}
                        </div>
                      )}
                      <div className="text-xl sm:text-2xl font-bold text-gray-900">
                        R$ {pixCashPrice.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* PIX Parcelado */}
              <div
                onClick={() => {
                  setPaymentMethod('PIX_INSTALLMENT');
                  if (installments === 1) setInstallments(3); // Default to 3 installments
                }}
                className="border-2 rounded-lg p-4 sm:p-6 cursor-pointer transition-all"
                style={{
                  borderColor: paymentMethod === 'PIX_INSTALLMENT' ? 'rgb(165, 44, 240)' : '#e5e7eb',
                  backgroundColor: paymentMethod === 'PIX_INSTALLMENT' ? 'rgba(165, 44, 240, 0.05)' : 'transparent'
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center">
                    <QrCode className="w-6 h-6 mr-3 flex-shrink-0" style={{ color: 'rgb(165, 44, 240)' }} />
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg">PIX Parcelado</h3>
                      <p className="text-xs sm:text-sm text-gray-600">Parcele em até {enrollment?.max_installments || 6}x via PIX</p>
                    </div>
                  </div>
                  {enrollment && (
                    <div className="text-right">
                      {hasDiscount && (
                        <div className="text-sm text-gray-400 line-through">
                          R$ {batchPixInstallmentPrice.toFixed(2)}
                        </div>
                      )}
                      <div className="text-xl sm:text-2xl font-bold text-gray-900">
                        R$ {pixInstallmentPrice.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                {paymentMethod === 'PIX_INSTALLMENT' && (
                  <div className="mt-4 pt-4 border-t">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de parcelas:
                    </label>
                    <select
                      value={installments}
                      onChange={(e) => setInstallments(Number(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple text-gray-900 bg-white"
                    >
                      {Array.from({ length: (enrollment?.max_installments || 6) - 1 }, (_, i) => i + 2).map((num) => (
                        <option key={num} value={num}>
                          {num}x de R$ {(pixInstallmentPrice / num).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Cartão de Crédito */}
              <div
                onClick={() => {
                  setPaymentMethod('CREDIT_CARD');
                  if (installments === 1) setInstallments(3); // Default to 3 installments
                }}
                className="border-2 rounded-lg p-4 sm:p-6 cursor-pointer transition-all"
                style={{
                  borderColor: paymentMethod === 'CREDIT_CARD' ? 'rgb(165, 44, 240)' : '#e5e7eb',
                  backgroundColor: paymentMethod === 'CREDIT_CARD' ? 'rgba(165, 44, 240, 0.05)' : 'transparent'
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="flex items-center">
                    <CreditCardIcon className="w-6 h-6 mr-3 flex-shrink-0" style={{ color: 'rgb(165, 44, 240)' }} />
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg">Cartão de Crédito</h3>
                      <p className="text-xs sm:text-sm text-gray-600">Parcele em até {enrollment?.max_installments || 7}x no cartão</p>
                    </div>
                  </div>
                  {enrollment && (
                    <div className="text-right">
                      {hasDiscount && (
                        <div className="text-sm text-gray-400 line-through">
                          R$ {batchCreditCardPrice.toFixed(2)}
                        </div>
                      )}
                      <div className="text-xl sm:text-2xl font-bold text-gray-900">
                        R$ {creditCardPrice.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                {paymentMethod === 'CREDIT_CARD' && (
                  <div className="mt-4 pt-4 border-t">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de Parcelas
                    </label>
                    <div className="relative">
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none bg-white text-gray-900"
                      >
                        {Array.from({ length: enrollment?.max_installments || 7 }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num}x de R$ {(creditCardPrice / num).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!showCardForm ? (
              <button
                onClick={handleCreatePayment}
                disabled={loading}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processando...' : 'Continuar'}
              </button>
            ) : (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Dados do Cartão</h2>
                  <button
                    onClick={() => setShowCardForm(false)}
                    className="text-sm font-medium"
                    style={{ color: 'rgb(165, 44, 240)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'rgb(145, 24, 220)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgb(165, 44, 240)'}
                    disabled={loading}
                  >
                    ← Voltar
                  </button>
                </div>
                <CreditCardForm onSubmit={handleCardSubmit} loading={loading} />
              </div>
            )}
          </div>
        ) : (
          /* Confirmação de Pagamento */
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 mt-8">
            <div className="text-center mb-8">
              <div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                style={{
                  backgroundColor: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                    ? 'rgba(220, 253, 97, 0.2)'
                    : 'rgba(165, 44, 240, 0.2)'
                }}
              >
                <Check 
                  className="w-8 h-8"
                  style={{
                    color: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                      ? 'rgb(210, 243, 67)'
                      : 'rgb(165, 44, 240)'
                  }}
                />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                {payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                  ? '🎉 Pagamento Confirmado!'
                  : payment.pix_qr_code 
                    ? 'Pagamento Gerado!' 
                    : 'Pagamento Processado!'}
              </h1>
              
              {/* Indicação da Parcela */}
              {enrollment?.payment_method === 'PIX_INSTALLMENT' && (payment as any)?.installment_number && (
                <div className="mb-3">
                  <span className="inline-block px-4 py-2 rounded-full font-semibold text-sm" style={{ backgroundColor: 'rgba(165, 44, 240, 0.1)', color: 'rgb(165, 44, 240)' }}>
                    Parcela {(payment as any).installment_number}/{enrollment.installments}
                  </span>
                </div>
              )}
              
              <p className="text-gray-600">
                {payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                  ? 'Seu pagamento foi confirmado com sucesso! Você receberá um email de confirmação.'
                  : payment.pix_qr_code 
                    ? 'Escaneie o QR Code ou copie o código PIX'
                    : 'Seu pagamento com cartão está sendo processado'}
              </p>
            </div>

            {/* QR Code */}
            {payment.pix_qr_code && (
              <div className="flex justify-center mb-8">
                <img
                  src={`data:image/png;base64,${payment.pix_qr_code}`}
                  alt="QR Code PIX"
                  className="w-64 h-64 border-4 border-gray-200 rounded-lg"
                />
              </div>
            )}

            {/* Código Copia e Cola */}
            {(payment as any)?.pix_copy_paste && (
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código PIX (Copia e Cola):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={(payment as any).pix_copy_paste}
                    readOnly
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  />
                  <button
                    onClick={copyPixCode}
                    className="px-6 py-3 rounded-lg transition-colors flex items-center gap-2 font-semibold"
                    style={{ backgroundColor: 'rgb(165, 44, 240)', color: '#ffffff' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(145, 24, 220)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(165, 44, 240)'}
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Informações do Pagamento */}
            <div 
              className="border rounded-lg p-6 mb-8"
              style={{
                backgroundColor: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' 
                  ? 'rgba(220, 253, 97, 0.1)' 
                  : 'rgba(165, 44, 240, 0.05)',
                borderColor: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' 
                  ? 'rgb(220, 253, 97)' 
                  : 'rgba(165, 44, 240, 0.2)'
              }}
            >
              <h3 className="font-semibold text-lg mb-4">Detalhes do Pagamento</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Valor:</span>
                  <span className="font-semibold">R$ {payment.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Vencimento:</span>
                  <span className="font-semibold">
                    {new Date(payment.due_date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span 
                    className="font-semibold"
                    style={{
                      color: payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                        ? 'rgb(210, 243, 67)'
                        : '#d97706'
                    }}
                  >
                    {payment.status === 'CONFIRMED' || payment.status === 'RECEIVED' 
                      ? '✓ Pagamento Confirmado!' 
                      : 'Aguardando Pagamento'}
                  </span>
                </div>
                {(payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') && payment.paid_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pago em:</span>
                    <span className="font-semibold" style={{ color: 'rgb(210, 243, 67)' }}>
                      {new Date(payment.paid_at).toLocaleDateString('pt-BR')} às {new Date(payment.paid_at).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center space-y-4">
              {payment.status !== 'CONFIRMED' && payment.status !== 'RECEIVED' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Já pagou e ainda mostra aguardando pagamento? Clique em atualizar status para verificar. Você também pode acessar a página "minha inscrição"
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        const response = await getEnrollment(Number(enrollmentId));
                        setEnrollment(response.data);
                        const updatedPayment = response.data.payments?.find((p: any) => p.id === payment.id);
                        if (updatedPayment) {
                          setPayment(updatedPayment);
                        }
                      } catch (err) {
                        console.error('Error refreshing payment:', err);
                      }
                    }}
                    className="btn-primary"
                  >
                    🔄 Atualizar Status de Pagamento
                  </button>
                </div>
              )}
              <button
                onClick={() => navigate('/')}
                className="btn-secondary"
              >
                Voltar para Início
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
