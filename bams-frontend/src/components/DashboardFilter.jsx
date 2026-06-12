import React, { useEffect, useState } from "react";
import CustomButton from "./ui/CustomButton";
import CustomSearchBar from "./ui/CustomSearchBar";
import CustomSelect from "./ui/CustomSelect";
import FilterField from "./ui/FilterField";
import { Funnel, RotateCcw, X } from "lucide-react";
import { DEFAULT_TRANSACTION_FILTERS } from "../lib/transactional-helper";

const selectTriggerClassName = "h-9! w-full justify-between text-sm";
const selectContentClassName = "min-w-52";

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
          <CustomSelect
            size="2"
            value={draftFilters.entity}
            options={filterOptions?.entities}
            onValueChange={(value) => updateFilter("entity", value)}
            showSearch
            searchPlaceholder="Search entities..."
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField> */}

        <FilterField label="Bank">
          <CustomSelect
            size="2"
            value={draftFilters.bank}
            options={filterOptions?.banks}
            onValueChange={(value) => updateFilter("bank", value)}
            showSearch
            searchPlaceholder="Search banks..."
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField>

        <FilterField label="Account">
          <CustomSelect
            size="2"
            value={draftFilters.account}
            options={filterOptions?.accounts}
            onValueChange={(value) => updateFilter("account", value)}
            showSearch
            searchPlaceholder="Search accounts..."
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField>

        <FilterField label="Transaction Type">
          <CustomSelect
            size="2"
            value={draftFilters.txnType}
            options={filterOptions?.transactionTypes}
            onValueChange={(value) => updateFilter("txnType", value)}
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField>

        <FilterField label="Mode">
          <CustomSelect
            size="2"
            value={draftFilters.mode}
            options={filterOptions?.modes}
            onValueChange={(value) => updateFilter("mode", value)}
            showSearch
            searchPlaceholder="Search modes..."
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField>

        <FilterField label="Category">
          <CustomSelect
            size="2"
            value={draftFilters.category}
            options={filterOptions?.categories}
            onValueChange={(value) => updateFilter("category", value)}
            showSearch
            searchPlaceholder="Search categories..."
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField>

        {/* <FilterField label="Status">
          <CustomSelect
            size="2"
            value={draftFilters.status}
            options={filterOptions?.statuses}
            onValueChange={(value) => updateFilter("status", value)}
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
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
          <CustomSelect
            size="2"
            value={draftFilters.currency}
            options={filterOptions?.currencies}
            onValueChange={(value) => updateFilter("currency", value)}
            triggerClassName={selectTriggerClassName}
            contentClassName={selectContentClassName}
          />
        </FilterField> */}
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-2 xl:justify-end">
        <CustomButton
          variant="outline"
          color="gray"
          size="2"
          className="h-9! flex-1 xl:flex-none"
          onClick={handleReset}
        >
          <RotateCcw className="h-4 w-4" />
          Reset Filters
        </CustomButton>

        <CustomButton
          size="2"
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
