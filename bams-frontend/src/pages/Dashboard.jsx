import React, { useState } from 'react';
import { MainDashboard } from '../components/MainDashboard';
import { useSetupStore } from '../store/setupStore';

const Dashboard = () => {
  const [tabValue, setTabValue] = useState('transactions');
  const {isSyncing, syncMessage} = useSetupStore();
  return (
    <div>
      <MainDashboard
        tabValue={tabValue}
        setTabValue={setTabValue}
        isSyncing={isSyncing}
        syncMessage={syncMessage}
      />
    </div>
  );
};

export default Dashboard;
