import React, { useCallback, useEffect, useState, useMemo } from 'react'
import { Badge, Spinner, Table } from '@radix-ui/themes';
import { EmptyMails } from '../utils/EmptyStates';
import CustomButton from '../components/ui/CustomButton';
import { Bell, UserPlus, AlertCircle } from 'lucide-react';
import SendInviteDialog from '../components/ui/SendInviteDialog';
import CheckInviteDialog from '../components/ui/CheckInviteDialog';
import { useFamilyStore } from '../store/familyStore';
import { useAuthStore } from '../store/authStore';
import { getPendingInvites } from '../lib/inviteApi';
import { cleanText, getStatusColor } from '../lib/helper';
import CustomTable from '../components/ui/CustomTable';

const ConsolidatedView = () => {
  const [isSendInviteDialogOpen, setIsSendInviteDialogOpen] = useState(false);
  const [isCheckInviteDialogOpen, setIsCheckInviteDialogOpen] = useState(false);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);

  const { fetchFamilyMembers, fetchFamilyEmails, familyEmails, loadingFamilyEmails, familyEmailsError, failedMembers, hasLoadedFamilyData, markFamilyDataLoaded, } = useFamilyStore();

  const { user } = useAuthStore();

  const refreshPendingInviteCount = useCallback(async () => {
    try {
      const data = await getPendingInvites();
      setPendingInviteCount(data?.invites?.length || 0);
    } catch (error) {
      setPendingInviteCount(0);
    }
  }, []);

  // Initial load on first visit to Family View in the current session
  useEffect(() => {
    if (!hasLoadedFamilyData && user) {
      const loadFamilyViewData = async () => {
        try {
          await Promise.all([
            refreshPendingInviteCount(),
            fetchFamilyMembers(),
            fetchFamilyEmails(),
          ]);
        } finally {
          markFamilyDataLoaded();
        }
      };

      loadFamilyViewData();
    }
  }, [user, hasLoadedFamilyData, fetchFamilyMembers, fetchFamilyEmails, refreshPendingInviteCount, markFamilyDataLoaded]);

  // Poll for pending invite count every 30 seconds
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshPendingInviteCount();
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [refreshPendingInviteCount]);

  // Refresh family data after accepting/declining invites or sending new invites manually
  const refreshFamilyView = useCallback(() => {
    refreshPendingInviteCount();
    fetchFamilyMembers();
    fetchFamilyEmails();
  }, [fetchFamilyMembers, fetchFamilyEmails, refreshPendingInviteCount]);

  // Email table columns
  const emailColumns = useMemo(() => [
    {
      key: "member_name",
      header: "From",
      render: (email) => (
        <div className="flex items-center gap-2">
          {email?.member_picture ? (
            <img
              src={email?.member_picture}
              alt={email?.member_name}
              className="h-6 w-6 rounded-full"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
              {(email?.member_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800">
              {email?.member_name}
            </p>
            <p className="truncate text-xs text-gray-500">
              {email?.member_email}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (email) => (
        <div className="min-w-0 ">
          <p
            className="truncate text-sm max-w-80 text-black"
            title={email?.subject}
          >
            {email?.subject || "Untitled alert"}
          </p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      cellClassName: "whitespace-nowrap",
      render: (email) => (
        <p className="text-xs text-gray-700">
          {email?.date || "-"}
        </p>
      ),
    },
    {
      key: "status",
      header: "Status",
      cellClassName: "whitespace-nowrap",
      render: (email) => {
        const status = email?.status?.toLowerCase();
        const statusColor = getStatusColor(status);

        return (
          <Badge
            color={statusColor}
            variant="soft"
            radius="full"
            className="font-semibold capitalize"
          >
            {email?.status || "Synced"}
          </Badge>
        );
      },
    },
    {
      key: "snippet",
      header: "Parsed Content",
      cellClassName: "max-w-[380px]",
      render: (email) => {
        const snippet = cleanText(email?.snippet);

        return (
          <p
            className="max-w-105 truncate text-sm leading-6 text-gray-800"
            title={snippet}
          >
            {snippet || "No parsed content available"}
          </p>
        );
      },
    },
    {
      key: "body",
      header: "Email Body",
      cellClassName: "max-w-[420px]",
      render: (email) => {
        const body = cleanText(email?.body);

        return (
          <p
            className="max-w-120 truncate text-sm leading-6 text-gray-800"
            title={body}
          >
            {body || "No body available"}
          </p>
        );
      },
    },
  ], []);

  return (
    <main className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 border-b border-gray-300 px-2 pb-3 gap-4">
        <div>
          <div className="flex items-start gap-4">
            <p className="text-2xl font-bold text-black text-shadow-xs">
              Multiple Accounts View
            </p>
          </div>
          <p className="mt-1 text-xs font-medium text-gray-500 text-shadow-xs">
            Combined alert data from all accounts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:ml-auto">
          {/* Total emails */}
          <div className="flex items-center gap-2">
            <Badge
              size="2"
              color="gray"
              variant="soft"
              radius="full"
              className="px-3 py-1 font-semibold"
            >
              {familyEmails?.length || 0} Total
            </Badge>
          </div>

          {/* Pending Invites */}
          <CustomButton
            size="2"
            className="relative overflow-visible bg-transparent! !border !border-transparent hover:!text-blue-800 hover:scale-110! transition-transform! duration-300! hover:!cursor-pointer !rounded-full !p-3 !text-gray-600 !shadow-none"
            onClick={() => {
              setIsCheckInviteDialogOpen(true);
            }}
          >
            <div className="relative">
              <Bell className="h-5 w-5 " />
              {pendingInviteCount > 0 && (
                <Badge
                  color="red"
                  radius="full"
                  className="absolute left-2.5 -top-2.5  text-white! min-w-4 min-h-4 bg-red-400! font-bold! justify-center rounded-full! px-2! text-[10.5px]! z-10"
                >
                  {pendingInviteCount}
                </Badge>
              )}
            </div>
          </CustomButton>

          {/* Manual refresh */}
          <CustomButton
            size="2"
            variant="outline"
            color="gray"
            radius="large"
            disabled={loadingFamilyEmails}
            onClick={refreshFamilyView}
          >
            {loadingFamilyEmails ? (
              <Spinner size="2" className="mr-2" />
            ) : null}
            Refresh Data
          </CustomButton>
          
          {/* Send Invites */}
          <CustomButton
            size="2"
            variant="solid"
            color="blue"
            radius="large"
            onClick={() => {
              setIsSendInviteDialogOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" /> Add accounts
          </CustomButton>

        </div>
      </div>

      {/* Error Messages */}
      {familyEmailsError && (
        <div className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p>{familyEmailsError}</p>
            {failedMembers.length > 0 && (
              <p className="mt-1 text-xs opacity-80">
                Could not fetch data for:{" "}
                {failedMembers?.map((m) => m.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Family Emails Table */}
      <div className="overflow-x-auto">

        {/* Loading State */}
        {loadingFamilyEmails ? (
          <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
            <Spinner size="3" />
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700"> Loading family data </p>
              <p className="mt-1 text-xs font-medium text-gray-400"> Fetching data from invited family members... </p>
            </div>
          </div>
        ) : familyEmails && familyEmails.length > 0 ? (

          // Data Table
          <CustomTable columns={emailColumns} data={familyEmails} />
        ) : (

          // Empty State
          <div className="p-8">
            <EmptyMails
              icon={<UserPlus className="text-gray-600 h-10 w-10" />}
              heading="No combined data found"
              description="Once family members accept invites, complete setup and have synced data, their data will appear here."
            />
          </div>
        )}
      </div>

      {isSendInviteDialogOpen && (
        <SendInviteDialog
          isSendInviteDialogOpen={isSendInviteDialogOpen}
          setIsSendInviteDialogOpen={setIsSendInviteDialogOpen}
          onInvitesChanged={refreshFamilyView}
        />
      )}
      {isCheckInviteDialogOpen && (
        <CheckInviteDialog
          isCheckInviteDialogOpen={isCheckInviteDialogOpen}
          setIsCheckInviteDialogOpen={setIsCheckInviteDialogOpen}
          onInvitesChanged={refreshFamilyView}
        />
      )}
    </main>
  );
}

export default ConsolidatedView

