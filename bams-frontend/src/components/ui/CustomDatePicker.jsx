import React, { useEffect, useMemo, useState } from "react";
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css"; // main css file
import "react-date-range/dist/theme/default.css"; // theme css file
import { format } from "date-fns";

const toDateValue = (date) => {
  if (!date) return "";

  const parsedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "";

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const parseDateValue = (dateValue) => {
  if (dateValue instanceof Date) return dateValue;
  if (!dateValue) return new Date();

  const [year, month, day] = String(dateValue).split("-").map(Number);
  if (!year || !month || !day) return new Date(dateValue);

  return new Date(year, month - 1, day);
};

const formatDisplayDate = (dateValue) => {
  const date = parseDateValue(dateValue);
  if (Number.isNaN(date.getTime())) return "-";

  return format(date, "dd MMM yyyy");
};

const formatInputBoundary = (dateValue) => {
  if (!dateValue) return undefined;
  return toDateValue(dateValue);
};

const CustomDatePicker = ({
  value,
  onChange,
  months = 2,
  direction = "horizontal",
  minDate,
  maxDate,
  showSelectedDates = true,
  className = "",
}) => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1024);
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const responsiveMonth = useMemo(() => {
    return isSmallScreen ? 1 : 2;
  }, [isSmallScreen]);

  const responsiveDirection = useMemo(() => {
    return isSmallScreen ? "vertical" : "horizontal";
  }, [isSmallScreen]);


  const range = useMemo(() => {
    const startDate = parseDateValue(value?.startDate);
    const endDate = parseDateValue(value?.endDate || value?.startDate);

    return [
      {
        startDate,
        endDate,
        key: "selection",
      },
    ];
  }, [value]);

  const handleChange = (item) => {
    const selection = item.selection;

    onChange?.({
      startDate: toDateValue(selection.startDate),
      endDate: toDateValue(selection.endDate),
    });
  };

  const handleInputChange = (key, nextValue) => {
    const nextRange = {
      startDate: value?.startDate || "",
      endDate: value?.endDate || "",
      [key]: nextValue,
    };

    if (
      nextRange.startDate &&
      nextRange.endDate &&
      nextRange.startDate > nextRange.endDate
    ) {
      if (key === "startDate") {
        nextRange.endDate = nextValue;
      } else {
        nextRange.startDate = nextValue;
      }
    }

    onChange?.(nextRange);
  };

  return (
    <div className={`bams-date-picker w-full max-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl lg:w-fit ${className}`}>
      {showSelectedDates ? (
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Selected Range
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {formatDisplayDate(value?.startDate)} - {formatDisplayDate(value?.endDate)}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3">
        <input
          type="date"
          value={value?.startDate || ""}
          min={formatInputBoundary(minDate)}
          max={value?.endDate || formatInputBoundary(maxDate)}
          onChange={(event) => handleInputChange("startDate", event.target.value)}
          className="h-10 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          style={{ colorScheme: "light" }}
          aria-label="Start date"
        />
        <input
          type="date"
          value={value?.endDate || ""}
          min={value?.startDate || formatInputBoundary(minDate)}
          max={formatInputBoundary(maxDate)}
          onChange={(event) => handleInputChange("endDate", event.target.value)}
          className="h-10 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          style={{ colorScheme: "light" }}
          aria-label="End date"
        />
      </div>

      <DateRange
        // className="max-w-xl"
        onChange={handleChange}
        showSelectionPreview={true}
        moveRangeOnFirstSelection={false}
        editableDateInputs={false}
        showDateDisplay={false}
        months={responsiveMonth}
        ranges={range}
        direction={responsiveDirection}
        minDate={minDate}
        maxDate={maxDate}
      />
    </div>
  );
};

export default CustomDatePicker;
