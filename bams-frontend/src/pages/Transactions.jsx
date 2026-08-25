import React from "react";
import { useAuthStore } from "../store/authStore";
import { AllTransactions } from "../components/AllTransactions";

export function Transactions() {
  const { org } = useAuthStore();

  return (
    <>
      <AllTransactions
        org={org}
      />
    </>
  );
}
