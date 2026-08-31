import React, { useState } from "react";
import CustomInput from "./ui/CustomInput";
import DialogPopup from "./ui/DialogPopup";
import axios from "axios";
import { accountsApi } from "../api/accounts";
import { TriangleAlert } from "lucide-react";
import { toast } from "react-toastify";

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

        if(result.status === 201){
          toast.success(`Account with account no. - ${account?.accountno} created successfully`)
        } else {
          toast.error("Error creating the account")
        }
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

        <CustomInput
          name="bank"
          type="text"
          labelText="Enter Bank Name *"
          placeholder="Axis Bank"
          value={account.bank}
          onChange={handleChange}
        />

        <CustomInput
          name="accountno"
          type="number"
          labelText="Enter Account Number *"
          placeholder="Enter number only (123456789)"
          value={account.accountno}
          onChange={handleChange}
        />

        <CustomInput
          name="type"
          type="text"
          labelText="Enter Account Type *"
          placeholder="Savings / Current / Demat"
          value={account.type}
          onChange={handleChange}
        />

        <CustomInput
          name="name"
          type="text"
          labelText="Enter Account Holder Name *"
          placeholder="John Doe"
          value={account.name}
          onChange={handleChange}
        />
      </div>
    </DialogPopup>
  );
};

export default AddAcounts;
