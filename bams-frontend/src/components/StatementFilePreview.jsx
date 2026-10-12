import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2 } from "lucide-react";
import { statementApi } from "../api/statements";

/** The body of a statement PDF preview: fetches the file from RustFS by its
 * storage key (through the backend) and shows it in an iframe, with a
 * full-screen toggle. Meant to be rendered inside a dialog -- dialogs only
 * mount their content while open, so the file is fetched on open. */
const StatementFilePreview = ({ storageKey, fileName }) => {
  const [fileUrl, setFileUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === previewRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (previewRef.current?.requestFullscreen) {
      await previewRef.current.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!storageKey) return undefined;

    let cancelled = false;
    let objectUrl = null;
    setLoading(true);
    setError(null);

    statementApi
      .getStatementFile(storageKey)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFileUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this statement file.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setFileUrl(null);
    };
  }, [storageKey]);

  return (
    <div
      ref={previewRef}
      className={`relative flex h-[76vh] min-h-[500px] items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50 ${isFullscreen ? "h-screen min-h-0 w-screen rounded-none border-0" : ""}`}
    >
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-10 rounded-md bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
        aria-label={isFullscreen ? "Exit full screen" : "View full screen"}
        title={isFullscreen ? "Exit full screen" : "View full screen"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      {loading && <Loader2 className="h-6 w-6 animate-spin text-gray-400" />}
      {!loading && error && <p className="text-sm text-gray-500">{error}</p>}
      {!loading && !error && fileUrl && (
        <iframe src={fileUrl} title={fileName || "Statement"} className="h-full w-full" />
      )}
    </div>
  );
};

export default StatementFilePreview;
