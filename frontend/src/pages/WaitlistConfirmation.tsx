import { CheckCircle2, Home } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

type ConfirmationState = {
  eventName?: string;
};

export default function WaitlistConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ConfirmationState | null;
  const eventName = state?.eventName?.trim();

  return (
    <div className="min-h-screen bg-[#060b08] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(41,87,63,0.94),rgba(11,24,17,0.96))] px-8 py-10 text-center sm:px-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/14 text-[#dff6e8]">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.36em] text-white/65">Lista de espera</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Pré-inscrição confirmada
            </h1>
          </div>

          <div className="space-y-6 px-8 py-10 text-center sm:px-12">
            <p className="text-lg leading-8 text-white/90">
              {eventName
                ? `Sua entrada na lista de espera do ${eventName} foi registrada com sucesso.`
                : 'Sua entrada na lista de espera foi registrada com sucesso.'}
            </p>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-white/64 sm:text-base">
              Quando surgir uma vaga, você será avisado pelos dados informados no cadastro para continuar sua inscrição.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7ffd6] px-6 py-3 text-sm font-semibold text-[#0d2317] transition hover:bg-[#ebffe9]"
              >
                <Home className="h-4 w-4" />
                Voltar para a home
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
