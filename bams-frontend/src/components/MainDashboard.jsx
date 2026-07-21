import React, { useEffect, useMemo, useRef, useState } from "react";
import DataCard from "../components/ui/DataCard";
import ChartCard from "../components/charts/ChartCard";
import { Flex, Tabs } from "@radix-ui/themes";
import { ArrowDown, ArrowUp, TrendingUp, ReceiptText, TrendingUpDown, TrendingDown, Calendar, ChevronDown, Filter, Loader2 } from "lucide-react";
import { formatCompactINR } from "../lib/helper";
import CustomButton from "../components/ui/CustomButton";
import CustomDonutChart from "../components/charts/CustomDonutChart";
import { CustomBarChart } from "../components/charts/CustomBarChart";
import CustomAreaTrendChart from "../components/charts/CustomAreaTrendChart";
import RecentTransactions from "../components/RecentTransactions";
import TransactionFilters from "../components/TransactionFilters";
import CustomDatePicker from "../components/ui/CustomDatePicker";
import CustomSelect from "../components/ui/CustomSelect";
import TopItemList from "../components/ui/TopItemList";
import { useDashboardFilterStore } from "../store/dashboardfilterStore";
import { formatTransactionDateRangeLabel, getTransactionFilterOptionsFromBackend } from "../lib/transactional-helper";
import { transactionApi } from "../api/transactions";
import { useSetupStore } from "../store/setupStore";

export const MainDashboard = ({ tabValue, setTabValue, isSyncing, syncMessage }) => {
  const [openFilter, setOpenFilter] = useState(false);
  const [openDateRangeFilter, setOpenDateRangeFilter] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState("daily");
  const dateRangePopoverRef = useRef(null);
  
  const { filters: appliedFilters, dateRange, applyFilters, resetFilters, setDateRange, } = useDashboardFilterStore();
  const refreshTrigger = useSetupStore((state) => state.refreshTrigger);

  const [isLoading, setIsLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [summaryData, setSummaryData] = useState({});
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentSort, setRecentSort] = useState({ field: "date", order: "desc" });

  const handleSort = (field) => {
    setRecentSort((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };
  
  // Fetch Filter Options once
  useEffect(() => {
    transactionApi.getFilterOptions()
      .then((res) => {
        setFilterOptions(getTransactionFilterOptionsFromBackend(res));
      })
      .catch(console.error);
  }, [refreshTrigger]);

  const queryFilters = useMemo(
    () => ({
      ...appliedFilters,
      dateRange,
      tab: tabValue,
    }),
    [appliedFilters, dateRange, tabValue],
  );

  // Fetch dashboard summary on filter change
  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        const res = await transactionApi.queryTransactions(
          queryFilters,
          { page: 1, pageSize: 1 },
          { summary: true, transactions: false },
        );
        if (res.summary) {
            setSummaryData(res.summary);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSummary();
  }, [queryFilters, refreshTrigger]);

  // Fetch recent transactions separately so sorting does not reload the full dashboard.
  useEffect(() => {
    const fetchRecentTransactions = async () => {
      setRecentLoading(true);
      try {
        const res = await transactionApi.queryTransactions(
          queryFilters,
          { page: 1, pageSize: 10 },
          { summary: false, transactions: true },
          recentSort,
        );
        if (res.transactions) {
            setRecentTransactions(res.transactions);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setRecentLoading(false);
      }
    };
    fetchRecentTransactions();
  }, [queryFilters, refreshTrigger, recentSort]);

  const maxSelectableDate = useMemo(() => new Date(), []);
  const dateRangeLabel = useMemo(() => formatTransactionDateRangeLabel(dateRange), [dateRange]);

  const hasActiveFilters = Object.keys(appliedFilters).some(
    (key) => appliedFilters[key] && appliedFilters[key] !== "all" && appliedFilters[key].length !== 0
  );

  // const records = useMemo(() => Array.isArray(transactions) ? transactions : [], [transactions]);

  const formatAmount = (val) => val ? `${formatCompactINR(val)}` : "₹ 0";

  const cards = useMemo(
    () => [
      {
        title: "Total transactions",
        value: summaryData?.totalTransactions || 0,
        icon: ReceiptText,
        color: "blue",
      },
      {
        title: "Total Credit",
        value: formatAmount(summaryData?.totalCredit),
        icon: ArrowDown,
        color: "green",
      },
      {
        title: "Total Debit",
        value: formatAmount(summaryData?.totalDebit),
        icon: ArrowUp,
        color: "red",
      },
      {
        title: "Net Cash Flow",
        value: formatAmount(summaryData?.netBalance),
        icon: TrendingUpDown,
        color: summaryData?.netBalance >= 0 ? "purple" : "orange",
      },
      {
        title: "Credit Count",
        value: summaryData?.creditCount || 0,
        icon: ArrowDown,
        color: "green",
      },
      {
        title: "Debit Count",
        value: summaryData?.debitCount || 0,
        icon: ArrowUp,
        color: "red",
      },
    ],
    [summaryData],
  );

  const MaxCreditAmount = formatCompactINR(summaryData?.maxCreditAmount || 0);
  const MaxDebitAmount = formatCompactINR(summaryData?.maxDebitAmount || 0);

  const topTransactions = summaryData?.topTransactions || [];
  const topDebitCategories = summaryData?.topDebitCategories || [];
  const topCreditCategories = summaryData?.topCreditCategories || [];
  const flaggedTransactions = summaryData?.flaggedTransactions || [];

  const cashFlowTrendData = summaryData?.cashFlowTrend || []; 
  const transactionsByModeData = summaryData?.transactionsByMode || [];

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
    <main className="flex overflow-y-auto flex-col gap-3 md:gap-4 relative">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-xl">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

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
            variant={hasActiveFilters ? "solid" : "outline"}
            size="sm"
            className={`ml-2 ${hasActiveFilters ? "text-white" : "text-gray-900"}!`}
            onClick={() =>setOpenFilter((prev) => !prev)}
          >
            <Filter className="sm:mr-1 h-4 w-4" /> 
            <span className="hidden sm:flex">Filter</span>
          </CustomButton>
        </div>
      </Flex>

      {/* Filter Section */}
      {openFilter && (
        <TransactionFilters
          filters={appliedFilters}
          filterOptions={filterOptions}
          onApply={applyFilters}
          onReset={resetFilters}
          onOpenChange={() => setOpenFilter(false)}
        />
      )}

      {isSyncing && (
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          {syncMessage || "Syncing your last 30 days of emails in the background. New rows may appear gradually."}
        </div>
      )}

      <Tabs.Root value={tabValue} className="w-full" onValueChange={(value) => setTabValue(value)}>
        <Tabs.List className="flex! w-full! gap-2 items-stretch! border-none! shadow-none! rounded-md! h-12!" style={{ boxShadow: "none" }}>
          <Tabs.Trigger value="transactions" className="flex-1! justify-center! bg-white! hover:bg-gray-50! border border-gray-50! shadow-md! rounded-md! text-sm font-medium text-gray-900! transition-colors! data-[state=active]:border-b-2! data-[state=active]:border-blue-600! data-[state=active]:text-blue-600! data-[state=active]:hover:bg-white! [&_.rt-BaseTabListTriggerInner]:bg-transparent!">
            Transactions
          </Tabs.Trigger>
          <Tabs.Trigger value="credit-card" className="flex-1! justify-center! bg-white! hover:bg-gray-50! border border-gray-50! shadow-md! rounded-md! text-sm font-medium text-gray-900! transition-colors! data-[state=active]:border-b-2! data-[state=active]:border-blue-600! data-[state=active]:text-blue-600! data-[state=active]:hover:bg-white! [&_.rt-BaseTabListTriggerInner]:bg-transparent!">
            Credit Card
          </Tabs.Trigger>
          <Tabs.Trigger value="fastag" className="flex-1! justify-center! bg-white! hover:bg-gray-50! border border-gray-50! shadow-md! rounded-md! text-sm font-medium text-gray-900! transition-colors! data-[state=active]:border-b-2! data-[state=active]:border-blue-600! data-[state=active]:text-blue-600! data-[state=active]:hover:bg-white! [&_.rt-BaseTabListTriggerInner]:bg-transparent!">
            Fastag
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      
      
      {/* Data Cards */}
      <Flex
        direction="row"
        wrap="wrap"
        className="gap-3 md:gap-4"
        align="center"
        justify="start"
      >
        {cards?.filter(c => tabValue !== 'fastag' || c.title === 'Total transactions').map((card) => (
          <DataCard key={card?.title} title={card?.title} value={card?.value} icon={card?.icon} color={card?.color} description={card?.description} />
        ))}

        {tabValue !== 'fastag' && (
          <>
            <DataCard title="Max Credit Amount" value={MaxCreditAmount} icon={TrendingUp} color="green" description="" />
            <DataCard title="Max Debit Amount" value={MaxDebitAmount} icon={TrendingDown} color="red" description="" />
          </>
        )}
      </Flex>

      {/* Charts */}
      {tabValue !== 'fastag' && (
        <>
          <Flex direction={{initial:"column", sm:"row"}} wrap="wrap" className="gap-3 md:gap-4">
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

            <ChartCard title="Transactions by Mode (Debit)">
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
        </>
      )}

      {/* Top Transactions */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-4">
      <TopItemList title="Top 5 Transactions" showBtn={true} btnText="View All" data={topTransactions} />
      {tabValue !== 'fastag' && (
        <TopItemList title="Transactions Flagged for Review" flagged={true} titleColor="text-red-800" btnText="View All" data={flaggedTransactions} />
      )}
      </div>

      
      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} tabValue={tabValue} sort={recentSort} onSort={handleSort} isLoading={recentLoading} />
    </main>
  );
};


 
