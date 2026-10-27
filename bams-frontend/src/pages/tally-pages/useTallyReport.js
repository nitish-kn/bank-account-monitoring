import { useEffect, useRef, useState } from "react";
import { tallyApi } from "../../api/tally";
import { getDefaultTransactionDateRange } from "../../lib/transactional-helper";

// From the start of the current financial year (1 April) to today.
const defaultRange = () => {
  const today = new Date();
  const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return { startDate: `${fyStartYear}-04-01`, endDate: getDefaultTransactionDateRange(today, 0).endDate };
};

const FILTER_DEBOUNCE_MS = 400;

const errorMessage = (err, title) => err.response?.data?.detail || err.message || `Failed to load ${title}.`;

// Companies loaded in Tally + one report for the picked company and date range.
// `load(dateRange, company, { refresh })` fetches the report. Pass `enabled: false` to hold off (e.g. until a
// ledger is picked) and a `key` that changes whenever `load` would fetch something different.
const useTallyReport = (title, load, { enabled = true, key = "" } = {}) => {
  const [dateRange, setDateRange] = useState(defaultRange);
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState("");
  const [companiesReady, setCompaniesReady] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRef = useRef(load);
  loadRef.current = load;
  // Bumped by reload() to refetch past the bridge's cache; `sentTick` is the last bump a request was sent for.
  const [reloadTick, setReloadTick] = useState(0);
  const sentTick = useRef(0);
  const hasFetched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    tallyApi.getReportCompanies()
      .then(({ companies: list, active }) => {
        if (cancelled) return;
        setCompanies(list);
        setCompany(active || list[0] || "");
      })
      .catch((err) => !cancelled && setError(errorMessage(err, title)))
      .finally(() => !cancelled && setCompaniesReady(true));
    return () => { cancelled = true; };
  }, [title]);

  useEffect(() => {
    if (!companiesReady || !company || !enabled || !dateRange.startDate || !dateRange.endDate) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    const refresh = reloadTick !== sentTick.current;
    // Filters often change a few times in a row (dates, company), so wait for the last change before
    // asking Tally. The first load and an explicit reload go straight out.
    const timer = setTimeout(() => {
      hasFetched.current = true;
      sentTick.current = reloadTick;
      loadRef.current(dateRange, company, { refresh })
        .then((result) => !cancelled && setData(result))
        .catch((err) => {
          if (cancelled) return;
          setData(null);
          setError(errorMessage(err, title));
        })
        .finally(() => !cancelled && setLoading(false));
    }, hasFetched.current && !refresh ? FILTER_DEBOUNCE_MS : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [title, companiesReady, company, enabled, key, dateRange, reloadTick]);

  // Nothing to fetch (no company open in Tally, or waiting for the caller to enable the report).
  const idle = companiesReady && (!company || !enabled);
  const reload = () => setReloadTick((tick) => tick + 1);
  return { dateRange, setDateRange, companies, company, setCompany, data, loading: loading && !idle, idle, error, reload };
};

export default useTallyReport;
