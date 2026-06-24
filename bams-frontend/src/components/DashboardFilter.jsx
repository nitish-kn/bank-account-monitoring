import React, { useEffect, useState } from "react";
import CustomButton from "./ui/CustomButton";
import CustomSearchBar from "./ui/CustomSearchBar";
import CustomDropDown from "./ui/CustomDropDown";
import FilterField from "./ui/FilterField";
import { Funnel, RotateCcw, X } from "lucide-react";
import { DEFAULT_TRANSACTION_FILTERS } from "../lib/transactional-helper";

const dropdownTriggerClassName = "h-9! w-full justify-between! text-sm";
const dropdownContentClassName = "min-w-56 max-h-72 overflow-y-auto";

const getAllOptionLabel = (options = [], fallback = "All") => (
  options.find((option) => option?.value === "all")?.label || fallback
);

const DashboardFilter = ({
  filters = DEFAULT_TRANSACTION_FILTERS,
  filterOptions,
  onApply,
  onReset,
  onOpenChange,
}) => {
  const [draftFilters, setDraftFilters] = useState(filters);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const updateFilter = (key, value) => {
    setDraftFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  };

  const handleReset = () => {
    setDraftFilters(DEFAULT_TRANSACTION_FILTERS);
    onReset?.();
  };

  const handleApply = () => {
    onApply?.(draftFilters);
  };

  return (
    <div className="bg-white py-4 px-6 space-y-4 rounded-xl shadow-md">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Filters</h2>
        <CustomButton
          variant="ghost"
          size="2"
          color="gray"
          className="hover:bg-gray-100 ml-auto"
          onClick={onOpenChange}
        >
          <X className="h-5 w-5" />
        </CustomButton>
      </div>

      {/* Filter Fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <FilterField label="Search" className="sm:col-span-2 xl:col-span-2">
          <CustomSearchBar
            value={draftFilters.search}
            onChange={(value) => updateFilter("search", value)}
            placeholder="Search transaction / ref no / counterparty"
            iconPosition="right"
            inputClassName="rounded-md border-gray-200 pl-3 pr-10"
          />
        </FilterField>

        {/* <FilterField label="Entity">
          <CustomDropDown
            value={draftFilters.entity}
            options={filterOptions?.entities}
            placeholder={getAllOptionLabel(filterOptions?.entities, "All Entities")}
            onValueChange={(value) => updateFilter("entity", value)}
            multiple
            showSearch
            searchPlaceholder="Search entities..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField> */}

        <FilterField label="Bank">
          <CustomDropDown
            value={draftFilters.bank}
            options={filterOptions?.banks}
            placeholder={getAllOptionLabel(filterOptions?.banks, "All Banks")}
            onValueChange={(value) => updateFilter("bank", value)}
            multiple
            showSearch
            searchPlaceholder="Search banks..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        <FilterField label="Account">
          <CustomDropDown
            value={draftFilters.account}
            options={filterOptions?.accounts}
            placeholder={getAllOptionLabel(filterOptions?.accounts, "All Accounts")}
            onValueChange={(value) => updateFilter("account", value)}
            multiple
            showSearch
            searchPlaceholder="Search accounts..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        <FilterField label="Account Holder Name">
          <CustomDropDown
            value={draftFilters.accountHolderName}
            options={filterOptions?.accountHolderNames}
            placeholder={getAllOptionLabel(filterOptions?.accountHolderNames, "All Account Holders")}
            onValueChange={(value) => updateFilter("accountHolderName", value)}
            multiple
            showSearch
            searchPlaceholder="Search account holders..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        <FilterField label="Account Type">
          <CustomDropDown
            value={draftFilters.accountType}
            options={filterOptions?.accountTypes}
            placeholder={getAllOptionLabel(filterOptions?.accountTypes, "All Account Types")}
            onValueChange={(value) => updateFilter("accountType", value)}
            multiple
            showSearch
            searchPlaceholder="Search account types..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        <FilterField label="Transaction Type">
          <CustomDropDown
            value={draftFilters.txnType}
            options={filterOptions?.transactionTypes}
            placeholder={getAllOptionLabel(filterOptions?.transactionTypes, "All Types")}
            onValueChange={(value) => updateFilter("txnType", value)}
            multiple
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        <FilterField label="Mode">
          <CustomDropDown
            value={draftFilters.mode}
            options={filterOptions?.modes}
            placeholder={getAllOptionLabel(filterOptions?.modes, "All Modes")}
            onValueChange={(value) => updateFilter("mode", value)}
            multiple
            showSearch
            searchPlaceholder="Search modes..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        <FilterField label="Category">
          <CustomDropDown
            value={draftFilters.category}
            options={filterOptions?.categories}
            placeholder={getAllOptionLabel(filterOptions?.categories, "All Categories")}
            onValueChange={(value) => updateFilter("category", value)}
            multiple
            showSearch
            searchPlaceholder="Search categories..."
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField>

        {/* <FilterField label="Status">
          <CustomDropDown
            value={draftFilters.status}
            options={filterOptions?.statuses}
            placeholder={getAllOptionLabel(filterOptions?.statuses, "All Statuses")}
            onValueChange={(value) => updateFilter("status", value)}
            multiple
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField> */}

        <FilterField label="Amount Range (₹)" className="sm:col-span-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-gray-200 bg-white px-2">
            <input
              type="number"
              min="0"
              value={draftFilters.minAmount}
              onChange={(event) =>
                updateFilter("minAmount", event.target.value)
              }
              placeholder="Min"
              className="h-9 min-w-0 border-0 bg-transparent px-1 text-sm text-gray-800 outline-none placeholder:text-gray-400"
            />
            <span className="text-sm font-semibold text-gray-800">to</span>
            <input
              type="number"
              min="0"
              value={draftFilters.maxAmount}
              onChange={(event) =>
                updateFilter("maxAmount", event.target.value)
              }
              placeholder="Max"
              className="h-9 min-w-0 border-0 bg-transparent px-1 text-sm text-gray-800 outline-none placeholder:text-gray-400"
            />
          </div>
        </FilterField>

        {/* <FilterField label="Currency">
          <CustomDropDown
            value={draftFilters.currency}
            options={filterOptions?.currencies}
            placeholder={getAllOptionLabel(filterOptions?.currencies, "All Currencies")}
            onValueChange={(value) => updateFilter("currency", value)}
            multiple
            align="start"
            buttonVariant="outline"
            buttonColor="gray"
            buttonSize="2"
            triggerClassName={dropdownTriggerClassName}
            contentClassName={dropdownContentClassName}
          />
        </FilterField> */}
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-2 justify-end">
        <CustomButton
          variant="outline"
          color="gray"
          size={{initial: "1", sm: "2"}}
          className="h-9! flex-1 xl:flex-none"
          onClick={handleReset}
        >
          <RotateCcw className="h-4 w-4" />
          Reset Filters
        </CustomButton>

        <CustomButton
          size={{initial: "1", sm: "2"}}
          className="h-9! flex-1 xl:flex-none"
          onClick={handleApply}
        >
          <Funnel className="h-4 w-4" />
          Apply Filters
        </CustomButton>
      </div>
    </div>
  );
};

export default DashboardFilter;
