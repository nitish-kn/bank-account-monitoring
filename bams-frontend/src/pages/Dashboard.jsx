import React, { useEffect, useMemo, useState } from 'react';
import { MainDashboard } from '../components/MainDashboard';
import { useEmailStore } from '../store/emailStore';

const Dashboard = () => {
  const [tabValue, setTabValue] = useState('transactions');
  const { syncedEmails, fetchSyncedEmails, loadingSynced } = useEmailStore();

  useEffect(() => {
    fetchSyncedEmails();
  }, [fetchSyncedEmails]);

  const filteredTransactions = useMemo(() => {
    const records = Array.isArray(syncedEmails) ? syncedEmails : [];

    const sourceText = (record) => {
      const values = [record?.txn_via, record?.mode, record?.account_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return values;
    };

    if (tabValue === 'credit-card') {
      return records.filter((record) => sourceText(record).includes('credit') || sourceText(record).includes('card'));
    }

    if (tabValue === 'fastag') {
      return records.filter((record) => sourceText(record).includes('fastag'));
    }

    return records.filter((record) => {
      const text = sourceText(record);
      return !text.includes('credit') && !text.includes('card') && !text.includes('fastag');
    });
  }, [syncedEmails, tabValue]);

  return (
    <div>
      <MainDashboard
        transactions={filteredTransactions}
        isLoading={loadingSynced}
        tabValue={tabValue}
        setTabValue={setTabValue}
      />
    </div>
  );
};

export default Dashboard;
