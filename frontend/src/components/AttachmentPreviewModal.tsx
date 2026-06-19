import { useEffect, useState } from 'react';

type AttachmentPreviewModalProps = {
  fileName: string;
  fileUrl: string;
  isOpen: boolean;
  onClose: () => void;
};

const getFileExtension = (value: string) => {
  const cleanValue = value.split('?')[0];
  const extension = cleanValue.split('.').pop();
  return extension ? extension.toLowerCase() : '';
};

const isImageExtension = (extension: string) =>
  ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(extension);

const isPdfExtension = (extension: string) => extension === 'pdf';

export default function AttachmentPreviewModal({
  fileName,
  fileUrl,
  isOpen,
  onClose,
}: AttachmentPreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isOpen || !fileUrl) {
      setPreviewUrl('');
      setLoading(false);
      setLoadError('');
      return;
    }

    let isMounted = true;
    let objectUrl = '';

    const loadPreview = async () => {
      setLoading(true);
      setLoadError('');

      try {
        const response = await fetch(fileUrl, { credentials: 'include' });
        if (!response.ok) {
          throw new Error('Não foi possível carregar o arquivo para visualização.');
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setPreviewUrl(objectUrl);
        }
      } catch (error: any) {
        if (isMounted) {
          setPreviewUrl('');
          setLoadError(error?.message || 'Não foi possível carregar a pré-visualização.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileUrl, isOpen]);

  if (!isOpen) return null;

  const extension = getFileExtension(fileUrl || fileName);
  const isImage = isImageExtension(extension);
  const isPdf = isPdfExtension(extension);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-6" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Visualização</p>
            <h3 className="truncate text-base font-black text-gray-950">{fileName}</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
            >
              Nova aba
            </a>
            <a
              href={fileUrl}
              download
              className="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800"
            >
              Baixar
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-dark px-3 py-2 text-xs font-semibold text-white"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="min-h-[60vh] flex-1 bg-gray-100">
          {loading && (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-gray-900">Carregando visualização...</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-gray-900">{loadError}</p>
              <p className="text-sm text-gray-600">Se preferir, abra em nova aba ou faça o download.</p>
            </div>
          )}

          {!loading && !loadError && isImage && previewUrl && (
            <div className="flex h-full items-center justify-center p-4">
              <img src={previewUrl} alt={fileName} className="max-h-[78vh] max-w-full rounded-2xl object-contain shadow-lg" />
            </div>
          )}

          {!loading && !loadError && isPdf && previewUrl && (
            <iframe
              title={fileName}
              src={previewUrl}
              className="h-[78vh] w-full bg-white"
            />
          )}

          {!loading && !loadError && !isImage && !isPdf && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-gray-900">Pré-visualização não disponível para este tipo de arquivo.</p>
              <p className="text-sm text-gray-600">Use “Nova aba” ou “Baixar” para abrir o arquivo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
