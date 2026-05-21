import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle, Clock, XCircle, CreditCard, AlertCircle, Edit } from 'lucide-react';
import { getEnrollments, type Enrollment } from '../services/api';

export default function MyEnrollments() {
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadEnrollments();
  }, []);

  const loadEnrollments = async () => {
    try {
      const response = await getEnrollments();
      
      // Handle both array and paginated response
      let enrollmentsData: Enrollment[] = [];
      
      if (Array.isArray(response.data)) {
        enrollmentsData = response.data;
      } else if (response.data && Array.isArray((response.data as any).results)) {
        // Paginated response
        enrollmentsData = (response.data as any).results;
      }
      
      setEnrollments(enrollmentsData);
    } catch (err: any) {
      console.error('Error loading enrollments:', err);
      setError(err.response?.data?.detail || err.message || 'Erro ao carregar inscrições. Verifique se o backend está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PAID':
        return <CheckCircle className="w-5 h-5" style={{ color: 'rgb(210, 243, 67)' }} />;
      case 'PENDING_PAYMENT':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'CANCELLED':
      case 'EXPIRED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'Pago';
      case 'PENDING_PAYMENT':
        return 'Aguardando Pagamento';
      case 'CANCELLED':
        return 'Cancelado';
      case 'EXPIRED':
        return 'Expirado';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'rgb(210, 243, 67)';
      case 'PENDING_PAYMENT':
        return '#eab308';
      case 'CANCELLED':
      case 'EXPIRED':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const backButtonClass = 'flex items-center mb-8 font-medium text-dark transition-colors hover:text-gold-700';
  const darkButtonClass = 'px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 bg-dark text-white hover:bg-dark-700';
  const goldButtonClass = 'px-4 py-2 rounded-lg font-medium transition-colors text-dark bg-gold hover:bg-gold-400';

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <button
          onClick={() => navigate('/')}
          className={backButtonClass}
        >
          <ArrowLeft className="w-5 h-5 mr-2" style={{ color: 'inherit' }} />
          Voltar
        </button>

        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Minhas Inscrições</h1>
          <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8">
            Visualize todas as suas inscrições e seus status
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-dark"></div>
              <p className="mt-4 text-gray-600">Carregando inscrições...</p>
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold mb-2">Nenhuma inscrição encontrada</h3>
              <p className="text-gray-600 mb-6">
                Você ainda não fez nenhuma inscrição
              </p>
              <button
                onClick={() => navigate('/inscricao')}
                className="btn-primary"
              >
                Fazer Inscrição
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {enrollments.map((enrollment) => {
                const hasConfirmedPayments =
                  enrollment.payments?.some(
                    (payment: any) => payment.status === 'CONFIRMED' || payment.status === 'RECEIVED'
                  ) ?? false;
                const editLabel = hasConfirmedPayments ? 'Editar Observações' : 'Editar Inscrição';
                const editTitle = hasConfirmedPayments
                  ? 'Editar observações da inscrição'
                  : 'Editar dados da inscrição';

                return (
                  <div
                    key={enrollment.id}
                    className="border rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow"
                    style={{
                      borderColor: enrollment.status === 'PAID' ? 'rgb(210, 243, 67)' : '#e5e7eb'
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 sm:gap-3 mb-3">
                          {getStatusIcon(enrollment.status)}
                          <h3 className="text-lg sm:text-xl font-semibold">
                            {enrollment.product_name || 'Produto'}
                          </h3>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
                          <div>
                            <span className="text-sm text-gray-600">Lote:</span>
                            <p className="font-medium">{enrollment.batch_name || 'N/A'}</p>
                          </div>
                          
                          <div>
                            <span className="text-sm text-gray-600">Valor:</span>
                            <p className="font-medium">R$ {enrollment.final_amount}</p>
                          </div>
                          
                          <div>
                            <span className="text-sm text-gray-600">Forma de Pagamento:</span>
                            <p className="font-medium">
                              {enrollment.payment_method === 'PIX_CASH' && 'PIX à Vista'}
                              {enrollment.payment_method === 'PIX_INSTALLMENT' && 'PIX Parcelado'}
                              {enrollment.payment_method === 'CREDIT_CARD' && 'Cartão de Crédito'}
                              {!enrollment.payment_method && 'Não definido'}
                            </p>
                          </div>
                          
                          <div>
                            <span className="text-sm text-gray-600">Data da Inscrição:</span>
                            <p className="font-medium">
                              {new Date(enrollment.created_at).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        <span
                          className="inline-block px-4 py-2 rounded-full text-sm font-semibold"
                          style={{
                            backgroundColor: `${getStatusColor(enrollment.status)}20`,
                            color: getStatusColor(enrollment.status)
                          }}
                        >
                          {getStatusText(enrollment.status)}
                        </span>
                      </div>
                    </div>

                    {/* Seção de Parcelas PIX */}
                    {enrollment.payment_method === 'PIX_INSTALLMENT' && enrollment.payments && enrollment.payments.length > 0 && (
                      <div className="mt-6 pt-6 border-t">
                        <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-dark" />
                          Parcelas PIX ({enrollment.installments}x)
                        </h4>
                        
                        <div className="space-y-3">
                          {enrollment.payments.map((payment: any, index: number) => {
                            const daysUntilDue = payment.due_date
                              ? Math.ceil((new Date(payment.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                              : null;
                            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
                            const isDueSoon = daysUntilDue !== null && daysUntilDue > 0 && daysUntilDue <= 7;

                            return (
                              <div
                                key={payment.id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-lg border gap-3"
                                style={{
                                  backgroundColor: payment.status === 'RECEIVED' || payment.status === 'CONFIRMED'
                                    ? 'rgba(34, 197, 94, 0.1)'
                                    : isOverdue
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : isDueSoon
                                    ? 'rgba(234, 179, 8, 0.3)'
                                    : 'rgba(229, 231, 235, 1)'
                                }}
                              >
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                                    <span className="font-semibold text-sm sm:text-base">
                                      Parcela {index + 1}/{enrollment.installments}
                                    </span>
                                    <span
                                      className="px-2 py-1 rounded text-xs font-medium"
                                      style={{
                                        backgroundColor: payment.status === 'RECEIVED' || payment.status === 'CONFIRMED'
                                          ? 'rgba(34, 197, 94, 0.2)'
                                          : isOverdue
                                          ? 'rgba(239, 68, 68, 0.2)'
                                          : 'rgba(234, 179, 8, 0.2)',
                                        color: payment.status === 'RECEIVED' || payment.status === 'CONFIRMED'
                                          ? 'rgb(22, 163, 74)'
                                          : isOverdue
                                          ? 'rgb(220, 38, 38)'
                                          : 'rgb(161, 98, 7)'
                                      }}
                                    >
                                      {payment.status === 'RECEIVED' || payment.status === 'CONFIRMED' ? '✓ Paga' :
                                       isOverdue ? '⚠ Vencida' :
                                       '⏳ Pendente'}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    {payment.due_date && (
                                      <span>
                                        Vencimento: {new Date(payment.due_date).toLocaleDateString('pt-BR')}
                                      </span>
                                    )}
                                    {isDueSoon && (
                                      <span className="flex items-center gap-1 text-yellow-700 font-medium">
                                        <AlertCircle className="w-4 h-4" />
                                        Vence em {daysUntilDue} {daysUntilDue === 1 ? 'dia' : 'dias'}
                                      </span>
                                    )}
                                    {isOverdue && (
                                      <span className="flex items-center gap-1 text-red-700 font-medium">
                                        <AlertCircle className="w-4 h-4" />
                                        Vencida há {Math.abs(daysUntilDue!)} {Math.abs(daysUntilDue!) === 1 ? 'dia' : 'dias'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                  <span className="font-bold text-base sm:text-lg">R$ {payment.amount}</span>
                                  
                                  {payment.status !== 'RECEIVED' && payment.status !== 'CONFIRMED' && (
                                    <button
                                      onClick={() => navigate(`/payment/${enrollment.id}?paymentId=${payment.id}`)}
                                      className={`${goldButtonClass} text-sm sm:text-base whitespace-nowrap`}
                                    >
                                      Pagar Agora
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                      </div>
                    )}

                    {enrollment.status === 'PAID' && enrollment.paid_at && (
                      <div className="mt-4 pt-4 border-t">
                        <span className="text-sm text-gray-600">
                          Pago em: {new Date(enrollment.paid_at).toLocaleDateString('pt-BR')} às{' '}
                          {new Date(enrollment.paid_at).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t">
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        {enrollment.status === 'PENDING_PAYMENT' && enrollment.payment_method !== 'PIX_INSTALLMENT' && (
                          <button
                            onClick={() => navigate(`/payment/${enrollment.id}`)}
                            className="btn-primary flex-1"
                          >
                            Continuar Pagamento
                          </button>
                        )}

                        <button
                          onClick={() => navigate(`/enrollment/edit/${enrollment.id}`)}
                          className={darkButtonClass}
                          title={editTitle}
                        >
                          <Edit className="w-4 h-4" />
                          <span className="text-sm sm:text-base">{editLabel}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
