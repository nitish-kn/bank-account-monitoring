import { useEffect, useRef, useState } from "react";
import { EllipsisVertical, ExternalLink, FileText, Loader2, Maximize2, Minimize2, TriangleAlert } from "lucide-react";
import { formatAmount } from "../lib/helper";
import { statementApi } from "../api/statements";
import CustomPopover from "../components/ui/CustomPopover";
import ActionList from "../components/ui/ActionList";
import CustomButton from "../components/ui/CustomButton";
import DialogPopup from "../components/ui/DialogPopup";


export const TypeBadge = ({ type }) => {
  const normalizedType = String(type || "").trim().toLowerCase();
  const isCredit = normalizedType === "credit";
  const isDebit = normalizedType === "debit";

  if (!isCredit && !isDebit) {
    return (
      <span className="inline-flex w-fit items-center justify-center rounded-md! bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
        -
      </span>
    );
  }

  const bgColor = isCredit ? "bg-green-100" : "bg-red-100";
  const textColor = isCredit ? "text-green-600" : "text-red-600";
  const label = isCredit ? "Credit" : "Debit";

  return (
    <span
      className={`inline-flex w-fit items-center justify-center rounded-md! px-2.5 py-1 text-xs font-semibold ${bgColor} ${textColor}`}
    >
      {label}
    </span>
  );
};


export const CategoryBadge = ({ category, type }) => {
  const isCredit = String(type).toLowerCase() === "credit";
  const bgColor = isCredit ? "bg-green-50" : "bg-red-50";
  const textColor = isCredit ? "text-green-600" : "text-red-600";
  const borderColor = isCredit ? "border-green-200" : "border-red-200";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium text-blue-700`}
    >
      {category ? category : "Others"}
    </span>
  );
};


// Preview the statement PDF a transaction was parsed from. The backend pulls
// it from RustFS by its storage key; it's only fetched once the dialog opens.
const StatementFileBadge = ({ sourceFilePath, fileName, className }) => {
  const [open, setOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);
  const [loading, setLoading] = useState(false);
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
    if (!open) return undefined;

    let cancelled = false;
    let objectUrl = null;
    setLoading(true);
    setError(null);

    statementApi
      .getStatementFile(sourceFilePath)
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
  }, [open, sourceFilePath]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-full"
        aria-label="Preview source statement"
      >
        <FileText className={`text-blue-600 w-5 h-5 ${className}`} />
      </button>

      <DialogPopup open={open} setOpen={setOpen} heading={fileName || "Statement"} maxWidth="1200px">
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
      </DialogPopup>
    </>
  );
};

// Preview the source in-app: the email for email rows, the stored statement
// PDF for statement rows. Statement rows without a stored file (parsed before
// storage existed, or the upload failed) keep the static icon.
export const SourceBadge = ({ source, email_metadata, parser_metadata, gmail_msg_id, className }) => {
  const [open, setOpen] = useState(false);

  if (source !== "email") {
    const sourceFilePath = parser_metadata?.source_file_path;
    if (sourceFilePath) {
      return <StatementFileBadge sourceFilePath={sourceFilePath} fileName={parser_metadata?.source_file} className={className} />;
    }

    return (
      <span className="flex items-center justify-center w-full">
        <FileText className={`text-blue-600 w-5 h-5 ${className}`} />
      </span>
    );
  }

  const fromName = email_metadata?.original_from_name;
  const fromEmail = email_metadata?.original_from_email;
  const fromLine = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromName || fromEmail || "";
  const gmailLink = gmail_msg_id ? `https://mail.google.com/mail/u/0/#inbox/${gmail_msg_id}` : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-full"
        aria-label="Preview source email"
      >
        <img src="./gmail-icon.png" alt="Gmail" className={`w-5 h-5 ${className}`} />
      </button>

      <DialogPopup open={open} setOpen={setOpen} heading={email_metadata?.subject || "Email"} subheading={fromLine} maxWidth="560px">
        <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
          {email_metadata?.body || "No preview available for this email."}
        </div>

        {/* Some senders' emails don't clean up perfectly here -- this is
            always the escape hatch rather than trying to detect "garbled". */}
        {gmailLink && (
          <p className="mt-3 flex items-center gap-1.5 text-xs pl-1 font-medium text-gray-600">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Doesn't look right?
            <a
              href={gmailLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              Open the original email <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </DialogPopup>
    </>
  );
};

export const AmountColor = ({ type, amount }) => {
  const normalizedType = String(type || "").trim().toLowerCase();
  const isCredit = normalizedType === "credit";
  const isDebit = normalizedType === "debit";
  const amountValue = parseFloat(amount || 0);
  const sign = isCredit ? "+" : "−";
  const color = isCredit ? "text-green-600" : isDebit ? "text-red-500" : "text-gray-700";

  return (
    <div className={`text-sm font-semibold w-full text-right ${color}`}>
      {sign} ₹ {formatAmount(amountValue)}
    </div>
  );
}


export const ActionBadge = ({ row }) => {
  return (
    <CustomPopover trigger={
      <CustomButton variant="ghost" color="gray" className="w-full! bg-transparent! hover:cursor-pointer!">
        <EllipsisVertical className="h-5 w-5 font-bold" />
      </CustomButton>
    }>
      <ActionList data={row} />
    </CustomPopover>
  )
}

const colorMap = {
  personal: "bg-yellow-100 text-yellow-800",
  business: "bg-purple-100 text-purple-800",
  huf: "bg-green-100 text-green-800",
  family: "bg-blue-100 text-blue-800",
  nre: "bg-red-100 text-red-800",
  firm: "bg-orange-100 text-orange-800",
  others: "bg-gray-100 text-gray-800",
};

export const AccountCategoryBadge = ({ category }) => {
  const colorClass = colorMap[category?.toLowerCase()] || colorMap.others;
  return (
    <span className={`inline-flex w-fit items-center justify-center rounded-md! px-2.5 py-1 text-xs font-semibold ${colorClass}`}
    >
      {category || "Others"}
    </span>
  );
};

// Role names are whatever an org names them, so this only special-cases the
// one name that's ever guaranteed to exist -- everything else gets a
// consistent neutral-blue pill rather than guessing at more colors.
export const RoleBadge = ({ role }) => {
  const isSuperAdmin = String(role || "").trim().toLowerCase() === "super admin";
  const colorClass = isSuperAdmin
    ? "bg-amber-100 text-amber-800"
    : "bg-blue-50 text-blue-700";

  return (
    <span className={`inline-flex w-fit items-center justify-center rounded-md! px-2.5 py-1 text-xs font-semibold ${colorClass}`}>
      {role || "-"}
    </span>
  );
};
