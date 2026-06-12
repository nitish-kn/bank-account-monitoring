import React, { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Headers from "./Headers";
import { useAuthStore } from "../store/authStore";
import { useSetupStore } from "../store/setupStore";

const Layout = () => {
  const { user } = useAuthStore();
  const { isSyncing, lastSyncAt, syncDashboard } = useSetupStore();
  const [showMenu, setShowMenu] = useState(false);
  const effectiveLastSyncAt = lastSyncAt || user?.last_synced_at;
  const showMenuRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return undefined;

    const handleOutsideClick = (event) => {
      if (showMenuRef.current && !showMenuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [showMenu]);

  return (
    <div className="relative w-full min-h-screen">
      
      <div className="flex w-full">
        <div className="hidden lg:flex">
          <Sidebar picture={user?.picture} name={user?.name} />
        </div>

        {showMenu && (
          <>
            {/* Dark overlay backdrop */}
            <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" />
            
            {/* Sidebar from the left */}
            <div ref={showMenuRef} className="fixed inset-y-0 left-0 bg-white shadow-xl z-50 lg:hidden animate-in slide-in-from-left-full duration-300">
              <Sidebar picture={user?.picture} name={user?.name} onClose={() => setShowMenu(false)} />
            </div>
          </>
        )}
        <div className="flex-1 flex flex-col min-h-screen bg-gray-200/50 overflow-hidden">
          <Headers
            name={user?.name}
            picture={user?.picture}
            isSyncing={isSyncing}
            lastSyncAt={effectiveLastSyncAt}
            syncDashboard={syncDashboard}
            setShowMenu={setShowMenu}
          />

          <main className="flex-1 p-3.5 overflow-y-auto">
            <Outlet />
          </main>
          
        </div>
      </div>
      
    </div>
  );
};

export default Layout;
