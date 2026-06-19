import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataCard from "../components/ui/DataCard";
import ChartCard from "../components/charts/ChartCard";
import { Flex } from "@radix-ui/themes";
import { sampleMails } from "../assets/sample-mails";
import { ArrowDown, ArrowUp, TrendingUp, ReceiptText, TrendingUpDown, TrendingDown, Calendar, ChevronDown, Filter, MailPlus, UserPlus, } from "lucide-react";
import { calculateTransactionSummary, filterTransactionsByDateRange, filterTransactions, formatTransactionDateRangeLabel, getDailyNetCashFlowTrend, getTopCategoryTotals, getTopTransactions, getTransactionFilterOptions, getTransactionTypeCountData, getTransactionsByModeData, hasActiveTransactionFilters, maxCreditAmount, maxDebitAmount, } from "../lib/transactional-helper";
import { formatCompactINR } from "../lib/helper";
import CustomButton from "../components/ui/CustomButton";
import CustomDonutChart from "../components/charts/CustomDonutChart";
import { CustomBarChart } from "../components/charts/CustomBarChart";
import CustomAreaTrendChart from "../components/charts/CustomAreaTrendChart";
import RecentTransactions from "../components/RecentTransactions";
import DashboardFilter from "../components/DashboardFilter";
import CustomDatePicker from "../components/ui/CustomDatePicker"
import CustomSelect from "../components/ui/CustomSelect";
import TopItemList from "../components/ui/TopItemList";
import { useDashboardFilterStore } from "../store/dashboardfilterStore";
import SendInviteDialog from "../components/ui/SendInviteDialog";
import CheckInviteDialog from "../components/ui/CheckInviteDialog";

const NewPage = () => {
  const [data] = useState(sampleMails);
  const [openFilter, setOpenFilter] = useState(false);
  const [openDateRangeFilter, setOpenDateRangeFilter] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState("daily");
  const dateRangePopoverRef = useRef(null);
  const { filters: appliedFilters, dateRange, applyFilters, resetFilters, setDateRange, } = useDashboardFilterStore();

  const records = data?.records || [];
  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(dateRange), [dateRange]);

  const filterOptions = useMemo(() => getTransactionFilterOptions(records), [records]);
  const filteredRecords = useMemo(
    () => filterTransactionsByDateRange(
      filterTransactions(records, appliedFilters),
      dateRange,
    ),
    [appliedFilters, dateRange, records],
  );
  
  const hasActiveFilters = useMemo(() => hasActiveTransactionFilters(appliedFilters), [appliedFilters]);

  const summaryData = useMemo(() => calculateTransactionSummary(filteredRecords), [filteredRecords]);

  const cards = useMemo(
    () => [
      {
        title: "Total transactions",
        value: summaryData?.totalTransactions,
        icon: ReceiptText,
        color: "blue",
      },
      {
        title: "Total Credit",
        value: summaryData?.formatted?.totalCredit,
        icon: ArrowDown,
        color: "green",
      },
      {
        title: "Total Debit",
        value: summaryData?.formatted?.totalDebit,
        icon: ArrowUp,
        color: "red",
      },
      {
        title: "Net Cash Flow",
        value: summaryData?.formatted?.netCashFlow,
        icon: TrendingUpDown,
        color: summaryData?.netCashFlow >= 0 ? "purple" : "orange",
      },
      {
        title: "Credit Count",
        value: summaryData?.creditCount,
        icon: ArrowDown,
        color: "green",
      },
      {
        title: "Debit Count",
        value: summaryData?.debitCount,
        icon: ArrowUp,
        color: "red",
      },
    ],
    [summaryData],
  );

  const MaxCreditAmount = formatCompactINR(maxCreditAmount(filteredRecords));
  const MaxDebitAmount = formatCompactINR(maxDebitAmount(filteredRecords));

  const topTransactions = useMemo(() => getTopTransactions(filteredRecords, 5), [filteredRecords]);
  const transactionTypeData = useMemo(() => getTransactionTypeCountData(filteredRecords), [filteredRecords]);
  const topDebitCategories = useMemo(() => getTopCategoryTotals(filteredRecords, "debit"), [filteredRecords]);
  const topCreditCategories = useMemo(() => getTopCategoryTotals(filteredRecords, "credit"), [filteredRecords]);
  const cashFlowTrendData = useMemo(() => getDailyNetCashFlowTrend(filteredRecords, dateRange), [dateRange, filteredRecords]);
  const transactionsByModeData = useMemo(() => getTransactionsByModeData(filteredRecords), [filteredRecords]);

  const cashFlowPeriodOptions = useMemo(
    () => [{ label: "Daily", value: "daily" }],
    [],
  );

  useEffect(() => {
    if (!openDateRangeFilter) return undefined;

    const handleOutsideClick = (event) => {
      if (
        dateRangePopoverRef.current && !dateRangePopoverRef.current.contains(event.target)) {
        setOpenDateRangeFilter(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [openDateRangeFilter]);

  return (
    <main className="flex overflow-y-auto flex-col gap-3 md:gap-4">

      {/* Dashboard Header */}
      <Flex direction={{initial:"column", sm: "row"}} align={{initial: "start", sm:"center"}}  position="relative" className="bg-white gap-4 p-4 rounded-xl shadow-md">
        {/* Header text */}
        <div className="flex flex-col gap-1 px-2">
          <h1 className="text-2xl font-bold text-gray-800">Transaction Dashboard</h1>
          <p className="text-xs text-gray-600 ml-1">View your transaction summary efficiently</p>
        </div>

        <div className="flex gap-2 items-center relative ml-auto">

          {/* Date Range Filter */}
          <div ref={dateRangePopoverRef} className="relative">
            <CustomButton color="gray" radius="large" className="text-gray-800!" variant="outline" size="sm" onClick={() => setOpenDateRangeFilter((prev) => !prev)} >
              <Calendar className="mr-1 h-4 w-4" /> 
              <span className="hidden sm:inline">{dateRangeLabel.long}</span>
              <span className="sm:hidden">{dateRangeLabel.short}</span>
              <ChevronDown className="ml-1 h-4 w-4" />
            </CustomButton>

            {/* Date Range Filter */}
            {openDateRangeFilter && (
              <>
                {/* Mobile: fixed full-screen overlay */}
                <div
                  className="lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2"
                  onClick={() => setOpenDateRangeFilter(false)}
                >
                  <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                    <CustomDatePicker
                      value={dateRange}
                      onChange={setDateRange}
                      maxDate={maxSelectableDate}
                    />
                  </div>
                </div>

                {/* Desktop lg+: absolute popover */}
                <div className="hidden lg:flex z-20 absolute top-10 right-0 justify-end">
                  <CustomDatePicker
                    value={dateRange}
                    onChange={setDateRange}
                    maxDate={maxSelectableDate}
                  />
                </div>
              </>
            )}
          </div>

          {/* Filter Button */}
          <CustomButton
            color={hasActiveFilters ? "blue" : "gray"}
            radius="large"
            variant={hasActiveFilters ? "soft" : "outline"}
            size="sm"
            className="ml-2 text-gray-900!"
            onClick={() =>setOpenFilter((prev) => !prev)}
          >
            <Filter className="sm:mr-1 h-4 w-4" /> 
            <span className="hidden sm:flex">Filter</span>
          </CustomButton>
        </div>
      </Flex>

      {/* Filter Section */}
      {openFilter && (
        <DashboardFilter
          filters={appliedFilters}
          filterOptions={filterOptions}
          onApply={applyFilters}
          onReset={resetFilters}
          onOpenChange={() => setOpenFilter(false)}
        />
      )}

      {/* Data Cards */}
      <Flex
        direction="row"
        wrap="wrap"
        className="gap-3 md:gap-4"
        align="center"
        justify="start"
      >
        {cards?.map((card) => (
          <DataCard key={card?.title} title={card?.title} value={card?.value} icon={card?.icon} color={card?.color} description={card?.description} />
        ))}

        <DataCard title="Max Credit Amount" value={MaxCreditAmount} icon={TrendingUp} color="green" description="" />
        <DataCard title="Max Debit Amount" value={MaxDebitAmount} icon={TrendingDown} color="red" description="" />
        {/* <DataCard title="Total Accounts" value={TotalAccounts} icon={Building} color="blue" description="" /> */}
      </Flex>

      {/* Charts */}
      <Flex direction={{initial:"column", sm:"row"}} wrap="wrap" className="gap-3 md:gap-4">
        {/* <ChartCard id="pie-chart" className="xl:flex-1" title="Credit vs Debit (Total)">
          <CustomDonutChart
            chartHeight="240"
            data={transactionTypeData}
            totalLabel={`${summaryData?.totalTransactions ?? 0}`}
            innerLabel="Total"
            centerTextclassName="top-2 whitespace-wrap"
          />
        </ChartCard> */}

        <ChartCard className="w-auto flex-1" title="Top Debit Categories">
          <CustomBarChart data={topDebitCategories} color="#dc2626" />
        </ChartCard>

        <ChartCard className="w-auto flex-1" title="Top Credit Categories">
          <CustomBarChart data={topCreditCategories} color="#16a34a" />
        </ChartCard>
      </Flex>

      {/* Cash Flow and Mode Charts */}
      <div className="grid grid-cols-1 gap-3 md:gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.8fr)]">
        <ChartCard
          title="Daily Net Cash Flow Trend"
          action={
            <CustomSelect
              value={cashFlowPeriod}
              options={cashFlowPeriodOptions}
              onValueChange={setCashFlowPeriod}
              showSearch={false}
              triggerClassName="h-8 min-w-24 text-sm"
              contentClassName="min-w-24"
            />
          }
        >
          <CustomAreaTrendChart data={cashFlowTrendData} />
        </ChartCard>

        <ChartCard title="Transactions by Mode">
          <CustomDonutChart
            data={transactionsByModeData}
            totalLabel={(transactionsByModeData.length || 0).toLocaleString("en-IN")}
            innerLabel="Total"
            showLegend
            showLabels={false}
            chartHeight="300"
            innerRadius="54%"
            outerRadius="78%"
            legendValueFormatter={(item) => `${item.percentLabel} (${item.count})`}
          />
        </ChartCard>
      </div>

      {/* Top Transactions */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-4">
      <TopItemList title="Top 5 Transactions" showBtn={true} btnText="View All" data={topTransactions} />
      <TopItemList title="Transactions Flagged for Review" flagged={true} titleColor="text-red-800" btnText="View All" data={topTransactions} />

      </div>

      
      {/* Recent Transactions */}
      <RecentTransactions transactions={filteredRecords} />
    </main>
  );
};

export default NewPage;
 
