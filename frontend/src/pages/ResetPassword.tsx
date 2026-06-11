import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { uid, token } = useParams<{ uid: string; token: string }>();
  
  const [formData, setFormData] = useState({
    new_password: '',
    new_password2: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.new_password !== formData.new_password2) {
      setError('As senhas não coincidem');
      setLoading(false);
      return;
    }

    try {
      await api.post('/users/password-reset-confirm/', {
        uid,
        token,
        new_password: formData.new_password,
        new_password2: formData.new_password2,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao redefinir senha. O link pode ter expirado.');
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
              Senha Alterada!
            </h1>
            <p className="text-gray-600 mb-6">
              Sua senha foi alterada com sucesso. Redirecionando para o login...
            </p>
            <Link
              to="/login"
              className="inline-block btn-primary"
            >
              Ir para Login
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
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'rgb(220, 253, 97)' }}>
            Criar senha
          </h1>
          <p className="text-gray-300">
            Defina sua senha para acessar sua inscrição
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
                <Lock className="w-4 h-4 inline mr-2" />
                Senha *
              </label>
              <input
                type="password"
                required
                value={formData.new_password}
                onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                style={{ outline: 'none' }}
                onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgb(165, 44, 240)'}
                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                placeholder="••••••••"
                minLength={8}
              />
              <p className="mt-1 text-xs text-gray-500">Mínimo de 8 caracteres</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar senha *
              </label>
              <input
                type="password"
                required
                value={formData.new_password2}
                onChange={(e) => setFormData({ ...formData, new_password2: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                style={{ outline: 'none' }}
                onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgb(165, 44, 240)'}
                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                placeholder="••••••••"
                minLength={8}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Salvando...' : 'Criar senha'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm"
              style={{ color: 'rgb(220, 253, 97)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'rgb(210, 243, 67)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgb(220, 253, 97)'}
            >
              Voltar para Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
