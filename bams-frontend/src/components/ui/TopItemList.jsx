import React from "react";
import { formatCompactINR } from "../../lib/helper";
import CustomButton from "./CustomButton";
import { AlertTriangle } from "lucide-react";
import { flaggedColors } from "../../utils/constants";


const TopItemList = ({
  title,
  btnText,
  showBtn = false,
  flagged = false,
  data,
  btnColor,
  titleColor,
}) => {
  return (
    <main className="bg-white flex flex-col flex-1 gap-4 p-4 rounded-xl shadow-md">
      <div className="flex items-center justify-between">
        <p className={`text-lg flex items-center gap-2 font-bold + ${titleColor}`}>
          {flagged && (<span> <AlertTriangle color="red" /> </span>)}
          {title}
        </p>
        
        {showBtn && (
          <CustomButton
            color={btnColor}
            variant="outline"
            size={{ initial: "1", md: "2" }}
            className="hover:bg-gray-100 ml-auto"
          >
            {btnText}
          </CustomButton>
        )}
      </div>

      <div className="overflow-x-auto">
        {data?.map((txn) => (
          <div
            key={txn?.gmail_message_id || txn?.id}
            className="flex items-center justify-between gap-3 text-mid py-2"
          >
            <p className="flex items-center gap-2 font-normal">
              {flagged && (<span className={`flex rounded-full h-2 w-2 ${flaggedColors["amber"]}`}/>)}
              {txn?.counterparty || "Unknown"}
            </p>
            <p className="font-semibold text-gray-900">
              {formatCompactINR(txn?.amount)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
};

export default TopItemList;
