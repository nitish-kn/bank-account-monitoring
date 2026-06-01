import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Headers from './Headers';
import { useAuthStore } from '../store/authStore';
import { useSetupStore } from '../store/setupStore';

const Layout = () => {
  const { user } = useAuthStore();
  const { isSyncing, lastSyncAt, syncDashboard } = useSetupStore();
  
  const effectiveLastSyncAt = lastSyncAt || user?.last_synced_at;

  return (
    <div className="relative w-full min-h-screen">
      <div className="flex w-full">
        <Sidebar picture={user?.picture} name={user?.name} />
        <div className="flex-1 flex flex-col min-h-screen bg-gray-50 overflow-hidden">
          <Headers 
            name={user?.name} 
            picture={user?.picture} 
            isSyncing={isSyncing} 
            lastSyncAt={effectiveLastSyncAt} 
            syncDashboard={syncDashboard} 
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
