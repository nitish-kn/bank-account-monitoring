import React, { useState } from 'react';
import { MainDashboard } from '../components/MainDashboard';

const Dashboard = () => {
  const [tabValue, setTabValue] = useState('transactions');
  return (
    <div>
      <MainDashboard
        tabValue={tabValue}
        setTabValue={setTabValue}
      />
    </div>
  );
};

export default Dashboard;
