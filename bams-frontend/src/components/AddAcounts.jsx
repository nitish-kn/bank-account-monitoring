import React, { useState } from "react";
import CustomSearchBar from "./ui/CustomSearchBar";
import DialogPopup from "./ui/DialogPopup";
import axios from "axios";
import { accountsApi } from "../api/accounts";
import { TriangleAlert } from "lucide-react";

const AddAcounts = ({open, setOpen}) => {
  const [account, setAccount] = useState({
    bank: "",
    accountno: "",
    type: "",
    name: "",
  });
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (value, e) => {
    setAccount((prev) => ({
      ...prev,
      [e.target.name]: value,
    }));
  };

  const handleAddAccount = async () => {
    setLoading(true)
    setError("")

    try{
        const result = await accountsApi.createAccounts(account)
        console.log(result)
        setOpen(false) // Close the modal on success
    } catch(err){
        setError(err.response?.data?.detail || err.message || "Failed to create account")
    } finally{
        setLoading(false)
    }
  }


  return (
    <DialogPopup
      showButtons
      open={open}
      setOpen={setOpen}
      heading="Add new Bank Account"
      successbtntxt="Add Account"
      onConfirm={handleAddAccount}
      isConfirming={loading}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium bg-red-50 p-2.5 rounded-lg border border-red-100">
            <TriangleAlert className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        <CustomSearchBar
          name="bank"
          type="text"
          labelText="Enter Bank Name *"
          placeholder="Axis Bank"
          value={account.bank}
          onChange={handleChange}
          iconClassName="hidden"
          iconPosition="right"
          className="flex flex-col gap-0.5"
        />

        <CustomSearchBar
          name="accountno"
          type="number"
          labelText="Enter Account Number *"
          placeholder="Enter number only (123456789)"
          value={account.accountno}
          onChange={handleChange}
          iconClassName="hidden"
          iconPosition="right"
        />

        <CustomSearchBar
          name="type"
          type="text"
          labelText="Enter Account Type *"
          placeholder="Savings / Current / Demat"
          value={account.type}
          onChange={handleChange}
          iconClassName="hidden"
          iconPosition="right"
        />

        <CustomSearchBar
          name="name"
          type="text"
          labelText="Enter Account Holder Name *"
          placeholder="John Doe"
          value={account.name}
          onChange={handleChange}
          iconClassName="hidden"
          iconPosition="right"
        />
      </div>
    </DialogPopup>
  );
};

export default AddAcounts;
