import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import CustomButton from "./ui/CustomButton";
import { Badge, Spinner } from "@radix-ui/themes";
import { formatRelativeSyncTime } from "../lib/helper";
import { ChevronDown, Menu } from "lucide-react";

const Headers = ({ name, picture, isSyncing, lastSyncAt, syncDashboard, setShowMenu }) => {
  const pathname = useLocation().pathname.split("/")[1];
  const pageTitle = pathname[0].toUpperCase() + pathname.slice(1);
  const [now, setNow] = useState(() => new Date());
  const syncLabel = formatRelativeSyncTime(lastSyncAt, now);
  const [showSyncTime, setShowSyncTime] = useState(false);
  const showSyncBadgeRef = useRef(null);

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
    if (!lastSyncAt) return undefined;

    setNow(new Date());
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [lastSyncAt]);

  return (
    <div className="flex items-center gap-2 justify-between sticky top-0 z-10 border-b border-gray-300 shadow-md px-4 md:px-6 py-3 md:py-4 bg-white">
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
        {syncLabel && (
          <Badge
            radius="large"
            variant="outline"
            className="hidden! md:flex! whitespace-nowrap text-xs! p-2! font-medium!"
          >
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
            btntext
          )}
        </CustomButton>

        <CustomButton color="gray" variant="ghost" className="ml-1! flex! md:hidden!" onClick={() => setShowSyncTime(prev => !prev)}>
          <ChevronDown className="h-4 w-4"/>
        </CustomButton>
        {showSyncTime && (
          <div ref={showSyncBadgeRef}>
            <div className="absolute top-10 left-6 bg-white whitespace-nowrap text-xs p-2 font-medium rounded-md shadow-lg"> {syncLabel} </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Headers;
