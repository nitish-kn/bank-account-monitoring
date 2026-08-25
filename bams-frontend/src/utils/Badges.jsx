import { EllipsisVertical, FileText } from "lucide-react";
import { formatAmount } from "../lib/helper";
import CustomPopover from "../components/ui/CustomPopover";
import ActionList from "../components/ui/ActionList";
import CustomButton from "../components/ui/CustomButton";


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


export const SourceBadge = ({ source, gmail_msg_id, className }) => {
  return (
    <a href={`https://mail.google.com/mail/u/0/#inbox/${gmail_msg_id}`} target="_blank" rel="noopener" className="flex items-center justify-center w-full gap-1">
      {source === "email" ? (
        // Email source
        <div className="flex items-center">
          <img src="./gmail-icon.png" alt="Gmail" className={`w-5 h-5 ${className}`} />
        </div>
      ) :
        <span><FileText className={`text-blue-600 w-5 h-5 ${className}`} /></span>
      }
    </a>
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
  jointbusiness: "bg-red-100 text-red-800",
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
