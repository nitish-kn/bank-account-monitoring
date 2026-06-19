import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Spinner, Table } from "@radix-ui/themes";
import { useEmailStore } from "../store/emailStore";
import { FileSpreadsheet, MailPlus, RotateCcw, TriangleAlert } from "lucide-react";
import CustomTable from "./ui/CustomTable";
import { cleanText, getStatusColor } from "../lib/helper";
import { EmptyMails } from "../utils/EmptyStates";
import Pagination from "./Pagination";

export function MainDashboard({ user, isSyncing, syncMessage, lastSyncAt, syncDashboard }) {
  const { syncedEmails, loadingSynced: loadingEmails, syncedError, } = useEmailStore();
  const [emailPage, setEmailPage] = useState(1);
  const [emailPageSize, setEmailPageSize] = useState(10);
  console.log(syncedEmails)
  const totalEmailPages = Math.max(Math.ceil((syncedEmails?.length || 0) / emailPageSize), 1);

  useEffect(() => {
    setEmailPage((page) => Math.min(page, totalEmailPages));
  }, [totalEmailPages]);

  const paginatedEmails = useMemo(() => {
    const start = (emailPage - 1) * emailPageSize;
    return syncedEmails.slice(start, start + emailPageSize);
  }, [emailPage, emailPageSize, syncedEmails]);

  const emailColumns = [
    {
      key: "subject",
      header: "Subject",
      // width: "w-[20%]",
      render: (email, idx) => (
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
      // width: "w-[16%]",
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
      // width: "w-[14%]",
      cellClassName: "whitespace-nowrap",
      render: (email) => {
        const status = email.status?.toLowerCase();

        const statusColor = getStatusColor(status);

        return (
          <Badge
            color={statusColor}
            variant="soft"
            radius="full"
            className="font-semibold capitalize"
          >
            {email.status || "Synced"}
          </Badge>
        );
      },
    },
    {
      key: "snippet",
      header: "Parsed Content",
      // width: "w-[38%]",
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
  ];

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Synced Emails Table Section */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-start gap-4">
              <p className="text-2xl font-bold text-black text-shadow-xs">
                Synced Alert Inbox
              </p>

              {/* {!loadingEmails && !syncedError && syncedEmails.length > 0 && (
                <CustomButton size="1" variant="soft" color="blue">
                  <RotateCcw className="w-4 h-4" />
                </CustomButton>
              )} */}
            </div>

            <p className="mt-1 text-xs font-medium text-gray-500 text-shadow-xs">
              Real-time parsed alerts fetched from your connected sheet
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto mt-2 lg:mt-0">
            <Badge
              size="2"
              color="gray"
              variant="soft"
              radius="full"
              className="px-3 py-1 font-semibold"
            >
              {syncedEmails?.length} Total
            </Badge>

            {user?.spreadsheet_id && (
              <Button
                size="2"
                color="green"
                radius="400"
                variant="outline"
                className="w-full md:w-auto"
                onClick={() => {
                  window.open(
                    `https://docs.google.com/spreadsheets/d/${user?.spreadsheet_id}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <FileSpreadsheet
                  fill="green"
                  stroke="white"
                  className="h-5 w-5"
                />
                Open in Google Sheets
              </Button>
            )}
          </div>
        </div>

        {isSyncing && (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
            {syncMessage || "Syncing your last 30 days of emails in the background. New rows may appear gradually."}
          </div>
        )}

        {/* Optional filter/search bar */}
        {/* <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 ml-auto">
            <TextField.Root
              size="2"
              placeholder="Search subject or parsed content..."
              className="w-full md:w-72"
            />

            <Button size="2" variant="soft" color="gray">
              Filter
            </Button>
          </div>
        </div> */}

        {/* Content */}
        <div className="overflow-x-auto">
          
          {/* Loading State */}
          {loadingEmails || (isSyncing && syncedEmails.length === 0) ? (

            <div className="flex w-full flex-col items-center justify-center gap-3 py-16">
              <Spinner size="3" />

              {loadingEmails ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">
                    Loading new emails
                  </p>
                  <p className="mt-1 text-xs font-medium text-gray-400">
                    Please wait while we fetch latest emails from your sheets...
                  </p>
                </div>
              ) : (

                <div className="text-sm font-semibold text-gray-700">
                  {syncMessage || "Processing..."}
                </div>
              )}
            </div>

          ) : syncedError ? (
            
            // If an error occured while loading new mails
            <div className="m-4 rounded-xl border border-red-100 bg-red-50 p-6 flex flex-col items-center justify-center gap-4 overflow-hidden">
              <TriangleAlert className="text-red-600 shrink-0" size={64} />

              <div className="text-center">
                <p className="text-sm font-bold text-red-700">
                  Unable to load synced emails
                </p>
                <p className="mt-1 text-xs font-medium text-red-500">
                  Please check Google Sheets permissions and try again.
                </p>
              </div>

              <pre className="max-h-32 w-full overflow-auto rounded-lg border border-red-100 bg-white/70 p-3 text-left text-xs leading-5 text-red-600 whitespace-pre-wrap break-words">
                {syncedError}
              </pre>
            </div>
          ) : syncedEmails.length === 0 ? (
              
            // No error but, no emails to show
            <EmptyMails heading="No synced mails found" description="Once the required emails are synced, they will appear here." />
          ) : (
            
            // The main table to show the parsed data
            <>
              <CustomTable
                columns={emailColumns}
                data={paginatedEmails}
                minWidth="900px"
                getRowKey={(email, idx) => email.id || email.message_id || email.subject || idx}
                emptyMessage="No synced emails found"
              />

              <Pagination
                currentPage={emailPage}
                totalItems={syncedEmails.length}
                pageSize={emailPageSize}
                itemLabel="alerts"
                onPageChange={setEmailPage}
                onPageSizeChange={(nextPageSize) => {
                  setEmailPageSize(nextPageSize);
                  setEmailPage(1);
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
