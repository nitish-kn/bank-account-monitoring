import { MailPlus, } from "lucide-react";

export const EmptyMails = ({icon = <MailPlus className="text-gray-600 h-10 w-10" />, heading, description}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      {icon}
      <p className="text-base font-semibold text-gray-700">{heading}</p>
      <p className="max-w-sm text-sm font-medium text-gray-400">
        {description}
      </p>
    </div>
  );
};
