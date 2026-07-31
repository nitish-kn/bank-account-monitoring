import React, { useState } from "react";
import {
  CalendarClock,
  CarFront,
  CreditCard,
  Eye,
  Hash,
  Info,
  Landmark,
  Mail,
  MapPin,
  Pencil,
  ReceiptText,
  UserRound,
} from "lucide-react";
import CustomButton from "./CustomButton";
import DialogPopup from "./DialogPopup";
import EditTransactionDialog from "./EditTransactionDialog";
import { cleanText, formatAmount, formatDateAndTime } from "../../lib/helper";
import { SourceBadge } from "../../utils/Badges";

const emptyValue = "-";

const isEmptyValue = (value) => {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const displayValue = (value) => {
  if (isEmptyValue(value)) return emptyValue;
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((item) => item !== emptyValue);
    return values.length ? values.join(", ") : emptyValue;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return cleanText(value);
};

const formatCurrency = (amount, currency = "INR") => {
  if (amount === null || amount === undefined || amount === "") return emptyValue;
  return `${currency || "INR"} ${formatAmount(amount)}`;
};

const toneClasses = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-green-50 text-green-700 border-green-100",
  red: "bg-red-50 text-red-700 border-red-100",
  gray: "bg-gray-50 text-gray-700 border-gray-100",
};

const normalizeType = (type) => String(type || "").trim().toLowerCase();

const formatConfidence = (value) => {
  if (isEmptyValue(value)) return emptyValue;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return displayValue(value);

  return numericValue <= 1
    ? `${Math.round(numericValue * 100)}%`
    : `${Math.round(numericValue)}%`;
};

const labelFromKey = (key) => {
  const labels = {
    card_name: "Card Name",
    card_type: "Card Type",
    credit_card_issuer: "Credit Card Issuer",
    credit_card_number: "Credit Card Number",
    credit_card_owner: "Credit Card Owner",
    trips_left: "Trips Left",
    vehicle_number: "Vehicle Number",
  };

  return labels[key] || String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const DetailPill = ({ children, tone = "gray" }) => (
  <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone] || toneClasses.gray}`}>
    {children || emptyValue}
  </span>
);

const DetailField = ({ label, value, children, className = "" }) => (
  <div className={`min-w-0 rounded-lg border border-gray-100 bg-white px-3 py-2.5 ${className}`}>
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
    <div className="mt-1 min-w-0 text-sm font-semibold text-gray-900">
      {children || (
        <p className="truncate" title={String(value || "")}>
          {displayValue(value)}
        </p>
      )}
    </div>
  </div>
);

const DetailSection = ({ title, icon: Icon, children }) => (
  <section className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm ring-1 ring-gray-100">
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-sm font-bold text-gray-900">{title}</p>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
  </section>
);

const SourceLink = ({ data }) => {
  if (data?.source !== "email" || !data?.gmail_message_id) {
    return <DetailPill tone="blue">{displayValue(data?.source || "statement")}</DetailPill>;
  }

  return (
    <a
      href={`https://mail.google.com/mail/u/0/#inbox/${data.gmail_message_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 rounded-md border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
    >
      <Mail className="h-3.5 w-3.5" />
      Gmail
    </a>
  );
};

const OptionalDetails = ({ data }) => {
  const optional = data?.optional_fields || {};
  const fields = Object.entries(optional)
    .filter(([, value]) => !isEmptyValue(value))
    .map(([key, value]) => [labelFromKey(key), value]);

  if (fields.length === 0) return null;

  const isFastag = String(data?.txn_via || "").toLowerCase().includes("fastag");
  const Icon = isFastag ? CarFront : CreditCard;

  return (
    <DetailSection title={isFastag ? "FASTag Details" : "Card Details"} icon={Icon}>
      {fields.map(([label, value]) => (
        <DetailField key={label} label={label} value={value} />
      ))}
    </DetailSection>
  );
};


const ActionList = ({ data }) => {
  const [openDialog, setOpenDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const transactionType = normalizeType(data?.txn_type);
  const typeTone = transactionType === "credit" ? "green" : transactionType === "debit" ? "red" : "gray";
  const { date, time } = formatDateAndTime(data?.txn_date);

  return (
    <>
      <div className="flex flex-col gap-2 px-1">
        <CustomButton
          color="gray"
          variant="ghost"
          size="2"
          className="h-8! flex! justify-start! gap-4! px-3!"
          onClick={() => setOpenDialog((prev) => !prev)}
        >
          <Eye className="h-5 w-5 font-bold" />
          View Details
        </CustomButton>

        <CustomButton
          color="gray"
          variant="ghost"
          size="2"
          className="h-8! flex! justify-start! gap-4! px-3!"
          onClick={() => setOpenEditDialog((prev) => !prev)}
        >
          <Pencil className="h-5 w-5 font-bold" />
          Edit Details
        </CustomButton>
      </div>

      <DialogPopup
        open={openDialog}
        setOpen={setOpenDialog}
        heading="Transaction Details"
        maxWidth="760px"
      >
        {data ? (
          <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
            <div className="flex flex-col gap-5 mt-1.5 ">

              <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">

                <div className="w-full">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-500">Narration</p>
                  <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap text-base font-semibold leading-6 text-gray-950">
                    {displayValue(data.narration)}
                  </p>
                </div>

                <div className="shrink-0 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-blue-100 sm:text-right">
                  <div className="flex justify-center">
                    <SourceBadge source={data?.source} gmail_msg_id={data?.gmail_message_id} className="w-10 h-10" />
                  </div>
                  <p className="text-[11px] mt-1.5 font-bold uppercase tracking-wide text-gray-400">Source</p>
                </div>
              </div>


              <div className="flex gap-3 w-full rounded-xl border border-blue-100 bg-blue-50/70 p-4">

                <div className="w-full border-r border-gray-400 pr-6">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-blue-500">Counterparty</p>
                  <p className="mt-1 truncate text-base font-bold text-gray-800" title={displayValue(data.counterparty)}>
                    {displayValue(data.counterparty)}
                  </p>


                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <DetailPill tone={typeTone}>{displayValue(data.txn_type).toUpperCase()}</DetailPill>
                    <DetailPill tone="blue" className="text-sm!">{displayValue(data.category || "Other")}</DetailPill>
                    <DetailPill tone="gray" className="text-sm!">{displayValue(data.txn_via || "Bank Transaction")}</DetailPill>
                  </div>
                </div>

                {data?.txn_via.toLowerCase() !== "fastag" && <DetailField label="Amount" className="w-80 text-right">
                  <p className={`text-2xl font-bold ${transactionType === "credit" ? "text-green-600" : transactionType === "debit" ? "text-red-500" : "text-gray-900"}`}>
                    {formatCurrency(data.amount, data.currency)}
                  </p>
                </DetailField>}
              </div>

            </div>

            <DetailSection title="Transaction" icon={ReceiptText}>
              <DetailField label="Date">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-gray-400" />
                  <span>{date || emptyValue}{time ? `, ${time}` : ""}</span>
                </div>
              </DetailField>
              <DetailField label="Mode" value={data.mode} />
              {data?.txn_via.toLowerCase() !== "fastag" && <DetailField label="Reference ID">
                <div className="flex min-w-0 items-center gap-2">
                  <Hash className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate" title={displayValue(data.ref_number)}>{displayValue(data.ref_number)}</span>
                </div>
              </DetailField>}
              <DetailField label="Place">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate" title={displayValue(data.place)}>{displayValue(data.place)}</span>
                </div>
              </DetailField>
              {data?.txn_via.toLowerCase() !== "fastag" && <DetailField label="Balance After" value={formatCurrency(data.balance_after_txn, data.currency)} />}
              <DetailField label="Counterparty Kind" value={data.counterparty_kind} />
            </DetailSection>

            <DetailSection title="Account" icon={Landmark}>
              <DetailField label="Bank" value={data.bank_name} />
              <DetailField label="Account Holder">
                <div className="flex min-w-0 items-center gap-2">
                  <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate" title={displayValue(data.account_holder_name)}>{displayValue(data.account_holder_name)}</span>
                </div>
              </DetailField>
              <DetailField label="Account Number" value={data.account_number} />
              <DetailField label="Account Type" value={data.account_type} />
            </DetailSection>

            <OptionalDetails data={data} />
          </div>
        ) : (
          <div className="text-sm text-gray-500">No transaction details available.</div>
        )}
      </DialogPopup>

      <EditTransactionDialog open={openEditDialog} setOpen={setOpenEditDialog} data={data} />
    </>
  );
};

export default ActionList;
