import React from "react";
import { useAuthStore } from "../store/authStore";
import { AllTransactions } from "../components/AllTransactions";

export function Transactions() {
  const { user } = useAuthStore();

  return (
    <>
      <AllTransactions
        user={user}
      />
    </>
  );
}
