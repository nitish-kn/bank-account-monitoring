import React, { useCallback, useEffect, useState } from 'react'
import { Clock, Mail } from 'lucide-react';
import DialogPopup from './DialogPopup';
import { useFamilyStore } from '../../store/familyStore';
import InviteListSection from '../family/InviteListSection';
import FamilyMemberListSection from '../family/FamilyMemberListSection';
import { acceptInvite, declineInvite, getPendingInvites, getSentInvites, } from '../../lib/inviteApi';

const CheckInviteDialog = ({ isCheckInviteDialogOpen, setIsCheckInviteDialogOpen, onInvitesChanged }) => {
  const [pendingInvites, setPendingInvites] = useState([]);
  const [sentInvites, setSentInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const { familyMembers, loadingFamilyMembers, error: familyError, fetchFamilyMembers, } = useFamilyStore();

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    setInviteError("");

    try {
      const [pendingData, sentData] = await Promise.all([
        getPendingInvites(),
        getSentInvites(),
      ]);

      setPendingInvites(pendingData?.invites || []);
      setSentInvites(sentData?.invites || []);
    } catch (error) {
      setInviteError(error.response?.data?.detail || "Failed to load invites");
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  const fetchDialogData = useCallback(async () => {
    await Promise.all([
      fetchInvites(),
      fetchFamilyMembers(),
    ]);
  }, [fetchFamilyMembers, fetchInvites]);

  useEffect(() => {
    if (isCheckInviteDialogOpen) {
      fetchDialogData();
    }
  }, [isCheckInviteDialogOpen, fetchDialogData]);

  const handleAcceptInvite = async (inviteId) => {
    setActionLoadingId(inviteId);
    setInviteError("");

    try {
      await acceptInvite(inviteId);
      await fetchDialogData();
      onInvitesChanged?.();
    } catch (error) {
      setInviteError(error.response?.data?.detail || "Failed to accept invite");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineInvite = async (inviteId) => {
    setActionLoadingId(inviteId);
    setInviteError("");

    try {
      await declineInvite(inviteId);
      await fetchInvites();
      onInvitesChanged?.();
    } catch (error) {
      setInviteError(error.response?.data?.detail || "Failed to decline invite");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <DialogPopup
      open={isCheckInviteDialogOpen}
      setOpen={setIsCheckInviteDialogOpen}
      heading="Check Invites"
      subheading="See pending invites, sent invite status, and your current family members."
      maxWidth="620px"
    >
      <div className="flex flex-col gap-5">
        {(inviteError || familyError) && (
          <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
            {inviteError || familyError}
          </div>
        )}

        <InviteListSection
          title="Pending Invites"
          icon={<Mail className="h-4 w-4 text-blue-700" />}
          invites={pendingInvites}
          loading={loadingInvites}
          emptyMessage="No pending invites."
          type="pending"
          actionLoadingId={actionLoadingId}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />

        <InviteListSection
          title="Sent Invites"
          icon={<Clock className="h-4 w-4 text-blue-700" />}
          invites={sentInvites}
          loading={loadingInvites}
          emptyMessage="No sent invites yet."
          type="sent"
        />

        <FamilyMemberListSection
          members={familyMembers}
          loading={loadingFamilyMembers}
        />
      </div>
    </DialogPopup>
  )
}

export default CheckInviteDialog
