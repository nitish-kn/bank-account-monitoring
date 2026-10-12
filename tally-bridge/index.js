const express = require("express");
const { basicAuth } = require("./middleware/auth");

const app = express();
app.use(express.json());
app.use(basicAuth);

// ─── Route Modules ──────────────────────────────────────────
// P1 — Core Masters (CRUD)
const accountingRoutes = require("./routes/accounting");
const inventoryRoutes = require("./routes/inventory");
const costCentreRoutes = require("./routes/costCentres");

// P2 — Transactions
const invoiceRoutes = require("./routes/invoices");
const transactionRoutes = require("./routes/transactions");
const purchaseInvoiceRoutes = require("./routes/purchaseInvoices");
const creditDebitNoteRoutes = require("./routes/creditDebitNotes");
const orderRoutes = require("./routes/orders");
const stockMovementRoutes = require("./routes/stockMovements");

// P3 — Additional Masters
const stockGroupRoutes = require("./routes/stockGroups");
const stockCategoryRoutes = require("./routes/stockCategories");
const godownRoutes = require("./routes/godowns");
const mastersRoutes = require("./routes/masters");

// P4 — Reports
const reportRoutes = require("./routes/reports");
const parsedReportRoutes = require("./routes/parsedReports");

// P5 — GST
const gstRoutes = require("./routes/gst");

// P6 — Payroll
const payrollRoutes = require("./routes/payroll");

// P7 — System
const systemRoutes = require("./routes/system");

// ─── Mount All Routes ───────────────────────────────────────
app.use(accountingRoutes);
app.use(inventoryRoutes);
app.use(costCentreRoutes);
app.use(invoiceRoutes);
app.use(transactionRoutes);
app.use(purchaseInvoiceRoutes);
app.use(creditDebitNoteRoutes);
app.use(orderRoutes);
app.use(stockMovementRoutes);
app.use(stockGroupRoutes);
app.use(stockCategoryRoutes);
app.use(godownRoutes);
app.use(mastersRoutes);
app.use(reportRoutes);
app.use(parsedReportRoutes);
app.use(gstRoutes);
app.use(payrollRoutes);
app.use(systemRoutes);

// ─── Root ───────────────────────────────────────────────────
app.get("/", (req, res) => {
  console.log("➡️  Hit /");
  res.send("Tally bridge running — full automation API");
});

// ─── Start Server ───────────────────────────────────────────
const { startStockScheduler } = require("./helpers/stockScheduler");

const PORT = 5555;
app.listen(PORT, () => {
  console.log(`Tally bridge running on port ${PORT}`);
  startStockScheduler();
});
