import React from "react";
import { SetupCard } from "./setup/SetupCard";
import { PermissionRequest } from "./setup/PermissionRequest";
import { SetupProgress } from "./setup/SetupProgress";
import { SetupError } from "./setup/SetupError";
import { SetupSuccess } from "./setup/SetupSuccess";

export function SetupFlowOverlay({
  user,
  permissionsMissing,
  needsEmail,
  needsSheets,
  loading,
  error,
  requestMissingPermissions,
  isLoading,
  message,
  stepHistory = [],
  setupError,
  retrySetup,
  isSetupComplete,
  emailsCount = 0,
  rowsWritten = 0,
  onClose,
}) {
  const renderContent = () => {
    if (isSetupComplete) {
      return (
        <SetupSuccess
          emailsCount={emailsCount}
          rowsWritten={rowsWritten}
          onClose={onClose}
        />
      );
    }

    if (setupError) {
      return <SetupError setupError={setupError} retrySetup={retrySetup} />;
    }

    if (isLoading) {
      return <SetupProgress message={message} stepHistory={stepHistory} />;
    }

    return (
      <PermissionRequest
        user={user}
        permissionsMissing={permissionsMissing}
        needsEmail={needsEmail}
        needsSheets={needsSheets}
        loading={loading}
        error={error}
        requestMissingPermissions={requestMissingPermissions}
      />
    );
  };

  return <SetupCard>{renderContent()}</SetupCard>;
}