import { formatINR } from "../../lib/helper";

// Tally balances are Dr positive, Cr negative.
export const drCr = (amount) => (amount ? `${formatINR(Math.abs(amount))} ${amount > 0 ? "Dr" : "Cr"}` : "-");

// Plain positive amount, "-" when zero.
export const money = (amount) => (amount ? formatINR(amount) : "-");

// Opening/closing balance: "-" when Tally gave none, a plain zero when it is nil.
export const balanceText = (amount) => (amount === null ? "-" : amount === 0 ? formatINR(0) : drCr(amount));

// Tally shows voucher types by their short names; spell out the ones we know, show any other as-is.
const VOUCHER_TYPE_NAMES = { Rcpt: "Receipt", Pymt: "Payment", Jrnl: "Journal", Ctra: "Contra", Purc: "Purchase" };
export const voucherTypeName = (type) => VOUCHER_TYPE_NAMES[type] || type;
