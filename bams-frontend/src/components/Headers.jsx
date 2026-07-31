import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import CustomButton from "./ui/CustomButton";
import { Badge, Spinner } from "@radix-ui/themes";
import { formatRelativeSyncTime } from "../lib/helper";
import { ChevronDown, Menu, Upload, CloudUpload, FileText, X } from "lucide-react";
import DialogPopup from "./ui/DialogPopup";
import api from "../lib/api";
import { toast } from "react-toastify";
import { useSetupStore } from "../store/setupStore";

const STATEMENT_UPLOAD_POLL_INTERVAL_MS = 5000;
const STATEMENT_UPLOAD_STARTED_TOAST_ID = "statement-upload-started";
const STATEMENT_UPLOAD_SUCCESS_TOAST_ID = "statement-upload-success";
const STATEMENT_UPLOAD_FAILED_TOAST_ID = "statement-upload-failed";

const getStatementSuccessMessage = (job) => {
  const result = job?.result || {};
  const rowsWritten = Number(result.rows_written || 0);

  if (rowsWritten > 0) {
    return `Statement parsing completed. ${rowsWritten} ${rowsWritten === 1 ? "transaction" : "transactions"} added.`;
  }

  return job?.message || "Statement parsing completed successfully.";
};

const Headers = ({ isSyncing, lastSyncAt, syncDashboard, setShowMenu }) => {
  const triggerRefresh = useSetupStore((state) => state.triggerRefresh);
  const pathname = useLocation().pathname.split("/")[1];
  const pageTitle = pathname[0].toUpperCase() + pathname.slice(1);
  const [now, setNow] = useState(() => new Date());
  const syncLabel = formatRelativeSyncTime(lastSyncAt, now);
  const [showSyncTime, setShowSyncTime] = useState(false);
  const showSyncBadgeRef = useRef(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [statementJobId, setStatementJobId] = useState(null);
  const [statementProcessing, setStatementProcessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const isStatementUploadBusy = uploading || statementProcessing;

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (isStatementUploadBusy) return;
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleFileSelect = (e) => {
    if (isStatementUploadBusy) return;
    const files = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (indexToRemove) => {
    if (isStatementUploadBusy) return;
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await api.post("/statements/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const jobId = response.data?.job_id;
      if (!jobId) {
        throw new Error("Statement upload did not return a background job id.");
      }

      setSelectedFiles([]);
      setShowUploadDialog(false);
      setStatementJobId(jobId);
      setStatementProcessing(true);
      toast.info(
        response.data?.message || "Statement upload started. Parsing will continue in the background.",
        { toastId: STATEMENT_UPLOAD_STARTED_TOAST_ID },
      );
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || "Failed to upload statements.";
      setUploadError(errMsg);
      toast.error(errMsg, { toastId: STATEMENT_UPLOAD_FAILED_TOAST_ID });
    } finally {
      setUploading(false);
    }
  };

  const btntext = pageTitle === "Dashboard" ? "Sync your data" : "Refresh data";

  useEffect(() => {
    if (!showSyncTime) return undefined;

    const handleOutsideClick = (event) => {
      if (
        showSyncBadgeRef.current &&
        !showSyncBadgeRef.current.contains(event.target)
      ) {
        setShowSyncTime(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [showSyncTime]);

  useEffect(() => {
    if (!statementJobId) return undefined;

    let isMounted = true;

    const stopStatementPolling = () => {
      if (!isMounted) return;
      setStatementJobId(null);
      setStatementProcessing(false);
    };

    const pollStatementStatus = async () => {
      try {
        const response = await api.get(`/statements/upload/${statementJobId}/status`);
        const job = response.data || {};

        if (job.status === "success") {
          toast.dismiss(STATEMENT_UPLOAD_STARTED_TOAST_ID);
          toast.success(getStatementSuccessMessage(job), {
            toastId: STATEMENT_UPLOAD_SUCCESS_TOAST_ID,
          });
          triggerRefresh();
          stopStatementPolling();
        } else if (job.status === "failed") {
          toast.dismiss(STATEMENT_UPLOAD_STARTED_TOAST_ID);
          toast.error(job.message || "Statement parsing failed.", {
            toastId: STATEMENT_UPLOAD_FAILED_TOAST_ID,
          });
          stopStatementPolling();
        }
      } catch (err) {
        const errMsg = err.response?.data?.detail || err.message || "Failed to check statement upload status.";
        toast.dismiss(STATEMENT_UPLOAD_STARTED_TOAST_ID);
        toast.error(errMsg, { toastId: STATEMENT_UPLOAD_FAILED_TOAST_ID });
        stopStatementPolling();
      }
    };

    pollStatementStatus();
    const intervalId = window.setInterval(pollStatementStatus, STATEMENT_UPLOAD_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [statementJobId, triggerRefresh]);


  // useEffect(() => {
  //   if (!lastSyncAt) return undefined;

  //   setNow(new Date());
  //   const intervalId = window.setInterval(() => {
  //     setNow(new Date());
  //   }, 30000);

  //   return () => window.clearInterval(intervalId);
  // }, [lastSyncAt]);

  return (
    <>
      <div className="flex items-center gap-2 justify-between sticky top-0 z-10 border-b border-gray-300 w-full shadow-md px-4 md:px-6 py-3 md:py-4 bg-white">
        <div className="flex items-center gap-2">
          <CustomButton
            className="mr-0.5! flex! lg:hidden!"
            color="gray"
            variant="ghost"
            onClick={() => {
              setShowMenu(true);
            }}
          >
            <Menu />
          </CustomButton>

          <p className="text-sm text-black font-medium">
            <span className="hidden md:inline">Account Management System / </span>
            <span className="text-blue-800 text-base md:text-sm font-semibold">{pageTitle}</span>
          </p>
        </div>
        <div className="flex md:flex-row items-center gap-1 md:gap-2.5 relative">
          <CustomButton onClick={() => setShowUploadDialog(true)} variant="soft" disabled={isStatementUploadBusy}>
            {isStatementUploadBusy ? "Processing..." : (
              <>
                <Upload className="h-4 w-4" /> 
                <span className="hidden md:inline">Upload Statements</span>
              </>
            )}
          </CustomButton>

          {/* {syncLabel && (
            <Badge
              radius="large"
              variant="outline"
              className="hidden! md:flex! whitespace-nowrap text-xs! p-2! font-medium!"
            >
              {syncLabel}
            </Badge>
          )} */}

          <CustomButton
            variant="soft"
            disabled={isSyncing}
            onClick={syncDashboard}
            className="cursor-pointer text-center"
          >
            {isSyncing ? (
              <span className="flex items-center gap-2">
                <Spinner size="1" />
                Syncing...
              </span>
            ) : (
              btntext
            )}
          </CustomButton>

          {/* <CustomButton color="gray" variant="ghost" className="ml-1! flex! md:hidden!" onClick={() => setShowSyncTime(prev => !prev)}>
            <ChevronDown className="h-4 w-4" />
          </CustomButton>
          {showSyncTime && (
            <div ref={showSyncBadgeRef}>
              <div className="absolute top-10 left-6 bg-white whitespace-nowrap text-xs p-2 font-medium rounded-md shadow-lg"> {syncLabel} </div>
            </div>
          )} */}
        </div>

      </div>

      <DialogPopup open={showUploadDialog} setOpen={setShowUploadDialog} heading="Upload Statements" subheading="Select one or multiple PDF, CSV, or Text statements to extract banking transactions directly." showButtons={false} >
        <div className="flex flex-col gap-4 mt-2">
          {/* Drag and Drop Zone */}
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-all bg-gray-50/50 hover:bg-blue-50/30 flex flex-col items-center justify-center gap-2 group"
          >
            <CloudUpload className="h-10 w-10 text-gray-400 group-hover:text-blue-500 transition-colors" />
            <p className="text-sm font-semibold text-gray-700">Drag & Drop bank statements here</p>
            <p className="text-xs text-gray-500">or click to browse from system (PDF/CSV/Text)</p>
            <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              className="hidden" 
              accept=".pdf,.csv,.txt"
            />
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-2 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Selected Files ({selectedFiles.length})</p>
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="font-medium text-gray-700 truncate max-w-64" title={file.name}>{file.name}</span>
                    <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => removeFile(idx)} 
                    className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg font-medium">
              {uploadError}
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex gap-3 mt-4 justify-end">
            <button
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                setUploadError(null);
                setShowUploadDialog(false);
              }}
              disabled={isStatementUploadBusy}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isStatementUploadBusy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all shadow-md shadow-blue-100 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Spinner size="1" />
                  Processing...
                </>
              ) : (
                "Upload & Parse"
              )}
            </button>
          </div>
        </div>
      </DialogPopup>
    </>
  );
};

export default Headers;
