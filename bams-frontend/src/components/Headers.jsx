import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import CustomButton from "./ui/CustomButton";
import { Badge, Spinner } from "@radix-ui/themes";
import { formatRelativeSyncTime } from "../lib/helper";

const Headers = ({ name, picture, isSyncing, lastSyncAt, syncDashboard }) => {
  const pathname = useLocation().pathname.split("/")[1];
  const pageTitle = pathname[0].toUpperCase() + pathname.slice(1);
  const [now, setNow] = useState(() => new Date());
  const syncLabel = formatRelativeSyncTime(lastSyncAt, now);

  useEffect(() => {
    if (!lastSyncAt) return undefined;

    setNow(new Date());
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [lastSyncAt]);

  return (
    <div className="flex items-center justify-between sticky top-0 z-10 border-b border-gray-300 shadow-md px-6 py-4 bg-white">
      <div className="flex items-center gap-2">
        <p className="text-sm text-black font-medium">
          Account Management System /{" "}
          <span className="text-blue-800">{pageTitle}</span>
        </p>
      </div>
      <div className="flex items-center gap-2.5">

        {syncLabel && (
          <Badge radius="full" variant="outline" className="whitespace-nowrap text-xs! p-2! font-medium!">
            {syncLabel}
          </Badge>
        )}

        <CustomButton
          variant="classic"
          disabled={isSyncing}
          onClick={syncDashboard}
          className="flex-1 py-3 px-4 border border-gray-200 text-gray-800 hover:bg-gray-50 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-center"
          color="bg-blue-500"
        >
          {isSyncing ? (
            <span className="flex items-center gap-2">
              <Spinner size="1" />
              Syncing...
            </span>
          ) : (
            "Sync your email data"
          )}
        </CustomButton>
      </div>
    </div>
  );
};

export default Headers;
