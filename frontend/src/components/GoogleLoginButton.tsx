import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, string | number>
          ) => void;
        };
      };
    };
  }
}

interface GoogleLoginButtonProps {
  onError?: (message: string) => void;
}

export default function GoogleLoginButton({ onError }: GoogleLoginButtonProps) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !buttonRef.current) {
      return;
    }

    const initializeGoogle = () => {
      if (!window.google?.accounts.id || !buttonRef.current || scriptLoadedRef.current) {
        return;
      }

      scriptLoadedRef.current = true;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          if (!credential) {
            onError?.('Não foi possível concluir o login com Google.');
            return;
          }

          try {
            const response = await fetch(`${API_URL}/users/google-login/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({ credential }),
            });

            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.detail || 'Erro ao autenticar com Google.');
            }

            login(data.user, data.token);
            navigate('/', { replace: true });
          } catch (error: any) {
            onError?.(error.message || 'Erro ao autenticar com Google.');
          }
        },
      });

      buttonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 360,
        text: 'continue_with',
        shape: 'pill',
      });
    };

    if (window.google?.accounts.id) {
      initializeGoogle();
      return;
    }

    const existingScript = document.querySelector('script[data-google-login="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', initializeGoogle, { once: true });
      return () => {
        existingScript.removeEventListener('load', initializeGoogle);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleLogin = 'true';
    script.addEventListener('load', initializeGoogle, { once: true });
    document.body.appendChild(script);

    return () => {
      script.removeEventListener('load', initializeGoogle);
    };
  }, [login, navigate, onError]);

  if (!(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) {
    return null;
  }

  return <div ref={buttonRef} className="flex justify-center" />;
}
