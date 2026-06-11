import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';

export default function ForgotPassword() {
  const location = useLocation();
  const isCreatePasswordFlow = location.pathname === '/criar-senha';
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/users/password-reset/', { email });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao enviar email. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: 'rgba(220, 253, 97, 0.2)' }}>
              <CheckCircle className="w-8 h-8" style={{ color: 'rgb(210, 243, 67)' }} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Email Enviado!
            </h1>
            <p className="text-gray-600 mb-6">
              {isCreatePasswordFlow ? 'Enviamos um link para você criar sua senha em ' : 'Enviamos instruções para recuperação de senha para '}
              <strong>{email}</strong>.
              Verifique sua caixa de entrada e spam.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: 'rgb(165, 44, 240)' }}>
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgb(220, 253, 97)' }}>
            {isCreatePasswordFlow ? 'Criar senha' : 'Esqueceu a senha?'}
          </h1>
          <p className="text-gray-300">
            {isCreatePasswordFlow
              ? 'Digite seu email para receber um link e definir sua senha de acesso'
              : 'Digite seu email e enviaremos instruções para recuperação'}
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-2" />
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                style={{ outline: 'none' }}
                onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgb(165, 44, 240)'}
                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                placeholder="seu@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : isCreatePasswordFlow ? 'Enviar link para criar senha' : 'Enviar instruções'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm"
              style={{ color: 'rgb(220, 253, 97)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'rgb(210, 243, 67)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgb(220, 253, 97)'}
            >
              <ArrowLeft className="w-4 h-4" style={{ color: 'inherit' }} />
              Voltar para Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
