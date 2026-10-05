import { useState } from 'react';
import axios from 'axios';
import { Loader2, Sparkles } from 'lucide-react';
import { getAdminAiInsights } from '../services/api';

const brandPurple = 'rgb(165, 44, 240)';

function getAiErrorMessage(err: unknown) {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 503) return 'IA não configurada.';
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
  }
  return 'Erro ao gerar a análise.';
}

export default function AiInsightsCard() {
  const [insights, setInsights] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAdminAiInsights();
      setInsights(res.data.insights);
    } catch (err) {
      setError(getAiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.07)] lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-purple/20 bg-purple/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">
            <Sparkles className="h-3.5 w-3.5" style={{ color: brandPurple }} />
            Análise com IA
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Resumo dos números do painel com destaques e pontos de atenção. Só dados agregados são enviados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={loading}
          className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          style={{ background: brandPurple }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {insights ? 'Analisar de novo' : 'Analisar com IA'}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      {insights && !error && (
        <div className="mt-4 whitespace-pre-line rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-800">
          {insights}
        </div>
      )}
    </section>
  );
}
