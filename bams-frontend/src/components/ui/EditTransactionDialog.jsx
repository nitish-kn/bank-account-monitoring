import React, { useState, useEffect } from "react";
import DialogPopup from "./DialogPopup";
import CustomSearchBar from "./CustomSearchBar";
import { transactionApi } from "../../api/transactions";
import { useSetupStore } from "../../store/setupStore";
import { Info, TriangleAlert, ArrowLeftRight } from "lucide-react";
import { formatAmount } from "../../lib/helper";

const EditTransactionDialog = ({ open, setOpen, data }) => {
  const [formState, setFormState] = useState({
    counterparty: "",
    mode: "",
    category: "",
    ref_number: "",
    narration: "",
    txn_date: "",
    account_number: "",
    account_holder_name: "",
    changed_by: "",
    reason: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Load transaction values when data changes
  useEffect(() => {
    if (data) {
      // Format datetime to YYYY-MM-DD for standard date input
      let formattedDate = "";
      if (data.txn_date) {
        try {
          formattedDate = String(data.txn_date).slice(0, 10);
        } catch (e) {}
      }

      setFormState({
        counterparty: data.counterparty || "",
        mode: data.mode || "",
        category: data.category || "",
        ref_number: data.ref_number || "",
        narration: data.narration || "",
        txn_date: formattedDate,
        account_number: data.account_number || "",
        account_holder_name: data.account_holder_name || "",
        changed_by: "",
        reason: "",
      });
      setError("");
      setShowConfirm(false);
    }
  }, [data, open]);

  const handleChange = (value, event) => {
    const name = event?.target?.name;
    if (name) {
      setFormState((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Get only changed fields
  const detectChanges = () => {
    const changedFields = [];
    const fields = [
      "counterparty",
      "mode",
      "category",
      "ref_number",
      "narration",
      "txn_date",
      "account_number",
      "account_holder_name",
    ];

    fields.forEach((field) => {
      let originalVal = data[field] || "";
      let currentVal = formState[field] || "";

      if (field === "txn_date" && originalVal) {
        originalVal = String(originalVal).slice(0, 10);
      }

      if (String(originalVal).trim() !== String(currentVal).trim()) {
        changedFields.push({
          field,
          label: field.replace(/_/g, " "),
          old: originalVal || "-",
          new: currentVal || "-",
        });
      }
    });

    return changedFields;
  };

  const handleUpdateClick = () => {
    setError("");
    if (!formState.changed_by.trim()) {
      setError("Name of person changing is mandatory.");
      return;
    }

    const changes = detectChanges();
    if (changes.length === 0) {
      setError("No fields have been modified.");
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirmUpdate = async () => {
    setLoading(true);
    setError("");

    try {
      const changesList = detectChanges();
      const updatePayload = {
        changed_by: formState.changed_by.trim(),
        reason: formState.reason.trim() || null,
      };

      // Populate only changed fields
      changesList.forEach((c) => {
        if (c.field === "txn_date") {
          // Send as ISO timestamp
          updatePayload[c.field] = new Date(formState.txn_date).toISOString();
        } else {
          updatePayload[c.field] = formState[c.field];
        }
      });

      await transactionApi.editTransaction(data.id, updatePayload);
      
      // Success: refresh parent states and close
      useSetupStore.getState().triggerRefresh();
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to update transaction.");
    } finally {
      setLoading(false);
    }
  };

  if (showConfirm) {
    const changes = detectChanges();
    return (
      <DialogPopup
        open={open}
        setOpen={setOpen}
        showButtons
        heading="Confirm Changes"
        subheading="Are you sure you want to save the following changes? This action will be logged in the audit trail."
        successbtntxt="Confirm Update"
        cancelbtntxt="Go Back"
        onConfirm={handleConfirmUpdate}
        isConfirming={loading}
        onCancel={() => setShowConfirm(false)}
      >
        <div className="flex flex-col gap-3">
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium bg-red-50 p-2.5 rounded-lg border border-red-100 mb-2">
              <TriangleAlert className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50/50">
            <div className="bg-gray-100/80 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">Audit Metadata</span>
            </div>
            <div className="p-3 text-xs text-gray-600 space-y-1 bg-white">
              <p><span className="font-semibold text-gray-700">Operator:</span> {formState.changed_by}</p>
              <p><span className="font-semibold text-gray-700">Reason:</span> {formState.reason || "(No reason provided)"}</p>
            </div>
          </div>

          <div className="text-xs font-bold text-gray-700 mt-2 px-1">Modified Fields</div>
          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {changes.map((c) => (
              <div key={c.field} className="p-3 border border-slate-100 bg-white rounded-lg shadow-sm">
                <p className="font-bold text-xs capitalize text-slate-800 mb-1.5">{c.label}</p>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="line-through text-red-500 bg-red-50 px-1.5 py-0.5 rounded truncate max-w-[45%]">{c.old}</span>
                  <ArrowLeftRight className="h-3 w-3 text-gray-400 shrink-0" />
                  <span className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-semibold truncate max-w-[45%]">{c.new}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogPopup>
    );
  }

  return (
    <DialogPopup
      open={open}
      setOpen={setOpen}
      showButtons
      heading="Edit Transaction Details"
      successbtntxt="Update"
      onConfirm={handleUpdateClick}
      maxWidth="500px"
    >
      <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1.5 py-2">
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium bg-red-50 p-2.5 rounded-lg border border-red-100">
            <TriangleAlert className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        {/* Audit Meta fields */}
        <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-xl space-y-3">
          <CustomSearchBar
            name="changed_by"
            type="text"
            labelText="Who is editing? (Mandatory) *"
            placeholder="Enter your name"
            value={formState.changed_by}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />
          <CustomSearchBar
            name="reason"
            type="text"
            labelText="Reason for edit (Optional)"
            placeholder="e.g. Corrected category mapping error"
            value={formState.reason}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />
        </div>

        {/* Read-Only fields */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
          <div>
            <label className="text-xs text-gray-500 font-bold block pb-1">Bank Name (Read-Only)</label>
            <p className="text-sm font-semibold text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-lg truncate">
              {data?.bank_name || "-"}
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-bold block pb-1">Amount (Read-Only)</label>
            <p className="text-sm font-semibold text-gray-800 bg-white border border-gray-200 px-3 py-2 rounded-lg truncate">
              ₹ {formatAmount(data?.amount || 0)}
            </p>
          </div>
        </div>

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-3">
          <CustomSearchBar
            name="counterparty"
            type="text"
            labelText="Counterparty"
            placeholder="Counterparty"
            value={formState.counterparty}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />

          <CustomSearchBar
            name="mode"
            type="text"
            labelText="Mode"
            placeholder="UPI / Net Banking / Card"
            value={formState.mode}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />

          <CustomSearchBar
            name="category"
            type="text"
            labelText="Category"
            placeholder="Food / Travel / Investment"
            value={formState.category}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />

          <CustomSearchBar
            name="ref_number"
            type="text"
            labelText="Reference ID"
            placeholder="Reference number"
            value={formState.ref_number}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />

          <CustomSearchBar
            name="account_number"
            type="text"
            labelText="Account Number"
            placeholder="Account number"
            value={formState.account_number}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />

          <CustomSearchBar
            name="account_holder_name"
            type="text"
            labelText="Account Holder Name"
            placeholder="Holder name"
            value={formState.account_holder_name}
            onChange={handleChange}
            iconClassName="hidden"
            iconPosition="right"
          />
        </div>

        <div>
          <label className="text-xs text-gray-800 font-semibold block pb-1">Transaction Date</label>
          <input
            type="date"
            name="txn_date"
            aria-label="Transaction Date"
            value={formState.txn_date}
            onChange={(e) => handleChange(e.target.value, e)}
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <CustomSearchBar
          name="narration"
          type="text"
          labelText="Narration"
          placeholder="Detailed transaction narration"
          value={formState.narration}
          onChange={handleChange}
          iconClassName="hidden"
          iconPosition="right"
        />
      </div>
    </DialogPopup>
  );
};

export default EditTransactionDialog;
