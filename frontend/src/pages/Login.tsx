import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { login as apiLogin } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authLogin } = useAuth();
  
  const from = (location.state as any)?.from || '/';
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiLogin(formData.email, formData.password);
      
      // Save to auth context
      authLogin(response.data.user, response.data.token);
      
      // Redirect to where user came from or home
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.non_field_errors?.[0] || 'Erro ao fazer login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 flex items-start justify-center px-4 sm:px-6 lg:px-8 py-2">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center">
            <img 
              src="/logo.png" 
              alt="JUMP" 
              className="w-48 h-48 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-white">
            Bem-vindo de volta!
          </h1>
          <p className="text-gray-300">
            Entre com sua conta para continuar
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
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                style={{ outline: 'none' }}
                onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="w-4 h-4 inline mr-2" />
                Senha
              </label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white"
                style={{ outline: 'none' }}
                onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #1a2e1a'}
                onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="w-4 h-4 border-gray-300 rounded"
                  style={{ accentColor: '#1a2e1a' }}
                />
                <span className="ml-2 text-sm text-gray-600">Lembrar-me</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium"
                style={{ color: '#1a2e1a' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#2a4a2a'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1a2e1a'}
              >
                Esqueceu a senha?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
              Ou continue com
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <GoogleLoginButton onError={setError} />

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Não tem uma conta?{' '}
              <Link
                to="/register"
                className="font-medium"
                style={{ color: '#1a2e1a' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#2a4a2a'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1a2e1a'}
              >
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            ← Voltar para início
          </Link>
        </div>
      </div>
    </div>
  );
}
