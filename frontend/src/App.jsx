import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import { apiRequest } from "./api";
import LoginPage from "./tabs/LoginPage";
import DashboardTab from "./tabs/DashboardTab";
import ProductsTab from "./tabs/ProductsTab";
import PurchasesTab from "./tabs/PurchasesTab";
import SalesTab from "./tabs/SalesTab";
import ExpensesTab from "./tabs/ExpensesTab";
import TransfersTab from "./tabs/TransfersTab";
import ReportsTab from "./tabs/ReportsTab";
import AdminTab from "./tabs/AdminTab";
import AccountsTab from "./tabs/AccountsTab";

const SESSION_KEY = "dable-session";

const navItems = [
  { path: "/dashboard", label: "Overview" },
  { path: "/products", label: "Products & Stock" },
  { path: "/purchases", label: "Purchases" },
  { path: "/sales", label: "Sales & Customers" },
  { path: "/expenses", label: "Expenses" },
  { path: "/transfers", label: "Branch Transfers" },
  { path: "/accounts", label: "Accounts & Funds", roles: ["ADMIN", "MANAGER"] },
  { path: "/reports", label: "Reports" },
  { path: "/admin", label: "Admin Tools", roles: ["ADMIN", "MANAGER"] },
];

const pageTitles = {
  "/dashboard": "Business Dashboard",
  "/products": "Inventory Workspace",
  "/purchases": "Purchase Control",
  "/sales": "Sales Invoices",
  "/expenses": "Expense Center",
  "/transfers": "Multi-Branch Transfers",
  "/accounts": "Cash, Bank & Card Accounts",
  "/reports": "Analytics & Reporting",
  "/admin": "System Administration",
};

function storedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function App() {
  const location = useLocation();
  const [session, setSession] = useState(storedSession);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [backups, setBackups] = useState([]);
  const [accounts, setAccounts] = useState({
    branchId: null,
    balances: { CASH: 0, BANK: 0, CARD: 0 },
    total: 0,
  });
  const [reports, setReports] = useState({
    dashboard: null,
    dailySales: null,
    profit: null,
    bestSelling: [],
    slowMoving: [],
    expenses: null,
    branchSummary: { branches: [] },
    accountsReceivable: { customers: [] },
    accountsPayable: { suppliers: [] },
    cashFlow: null,
    incomeStatement: null,
  });

  const token = session?.token;
  const user = session?.user;

  const branchParams = useMemo(() => {
    if (!user) {
      return {};
    }
    if (user.role === "ADMIN") {
      return selectedBranchId ? { branchId: selectedBranchId } : {};
    }
    return user.branchId ? { branchId: user.branchId } : {};
  }, [selectedBranchId, user]);

  const call = useCallback(
    (request) =>
      apiRequest({
        token,
        ...request,
      }),
    [token],
  );

  const onLogin = (payload) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    setSession(payload);
    if (payload?.user?.branchId) {
      setSelectedBranchId(payload.user.branchId);
    }
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setStatus("");
    setError("");
  };

  const loadCore = useCallback(async () => {
    if (!token) {
      return;
    }
    setError("");
    const [me, branchList, roleList, categoryList, unitList, expCatList] = await Promise.all([
      call({ url: "/auth/me" }),
      call({ url: "/branches" }),
      call({ url: "/roles" }),
      call({ url: "/categories" }),
      call({ url: "/units" }),
      call({ url: "/expense-categories" }),
    ]);
    setSession((prev) => ({ ...prev, user: me }));
    setBranches(branchList);
    setRoles(roleList);
    setCategories(categoryList);
    setUnits(unitList);
    setExpenseCategories(expCatList);

    if (!selectedBranchId) {
      const fallbackBranchId = me.branchId || branchList[0]?.id || null;
      if (fallbackBranchId) {
        setSelectedBranchId(Number(fallbackBranchId));
      }
    }

    try {
      const userList = await call({ url: "/users" });
      setUsers(userList);
    } catch {
      setUsers([]);
    }
  }, [call, selectedBranchId, token]);

  const loadBranchData = useCallback(async () => {
    if (!token) {
      return;
    }
    const [
      supplierList,
      customerList,
      productList,
      lowStockList,
      purchaseList,
      salesList,
      expenseList,
      transferList,
      dashboard,
      dailySales,
      accountBalances,
    ] =
      await Promise.all([
        call({ url: "/suppliers", params: branchParams }),
        call({ url: "/customers", params: branchParams }),
        call({ url: "/products", params: branchParams }),
        call({ url: "/alerts/low-stock", params: branchParams }),
        call({ url: "/purchases", params: branchParams }),
        call({ url: "/sales", params: branchParams }),
        call({ url: "/expenses", params: branchParams }),
        call({ url: "/transfers", params: branchParams }),
        call({ url: "/reports/dashboard", params: branchParams }),
        call({ url: "/reports/daily-sales", params: branchParams }),
        call({ url: "/finance/accounts", params: branchParams }),
      ]);
    setSuppliers(supplierList);
    setCustomers(customerList);
    setProducts(productList);
    setLowStock(lowStockList);
    setPurchases(purchaseList);
    setSales(salesList);
    setExpenses(expenseList);
    setTransfers(transferList);
    setAccounts(accountBalances);
    setReports((prev) => ({ ...prev, dashboard, dailySales }));
  }, [branchParams, call, token]);

  const loadAdminData = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const [logs, backupList] = await Promise.all([call({ url: "/audit-logs" }), call({ url: "/system/backups" })]);
      setAuditLogs(logs);
      setBackups(backupList);
    } catch {
      setAuditLogs([]);
      setBackups([]);
    }
  }, [call, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const run = async () => {
      try {
        setStatus("Syncing setup...");
        await loadCore();
      } catch (err) {
        setError(err.message);
      } finally {
        setStatus("");
      }
    };
    run();
  }, [loadCore, token]);

  useEffect(() => {
    if (!token || !selectedBranchId) {
      return;
    }
    const run = async () => {
      try {
        setStatus("Refreshing branch data...");
        await loadBranchData();
      } catch (err) {
        setError(err.message);
      } finally {
        setStatus("");
      }
    };
    run();
  }, [loadBranchData, selectedBranchId, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    loadAdminData();
  }, [loadAdminData, token]);

  const refreshProducts = () => loadBranchData();
  const refreshPurchases = () => loadBranchData();
  const refreshSales = () => loadBranchData();
  const refreshExpenses = () => loadBranchData();
  const refreshTransfers = () => loadBranchData();
  const refreshWorkspace = () => loadBranchData();
  const refreshUsers = async () => {
    const userList = await call({ url: "/users" });
    setUsers(userList);
  };

  const createProduct = async (payload) => {
    await call({ url: "/products", method: "POST", data: payload });
    await refreshProducts();
  };
  const adjustStock = async (payload) => {
    await call({ url: "/stock/adjust", method: "POST", data: payload });
    await refreshProducts();
  };
  const createSupplier = async (payload) => {
    await call({ url: "/suppliers", method: "POST", data: payload });
    await refreshPurchases();
  };
  const createPurchase = async (payload) => {
    await call({ url: "/purchases", method: "POST", data: payload });
    await refreshPurchases();
  };
  const addPurchasePayment = async (payload) => {
    await call({
      url: `/purchases/${payload.invoiceId}/payments`,
      method: "POST",
      data: {
        amount: Number(payload.amount),
        paymentMethod: payload.paymentMethod,
      },
    });
    await refreshPurchases();
  };
  const createCustomer = async (payload) => {
    await call({ url: "/customers", method: "POST", data: payload });
    await refreshSales();
  };
  const loadCustomerLedger = async (customerId) => {
    return call({ url: `/customers/${customerId}/ledger`, params: branchParams });
  };
  const createSale = async (payload) => {
    await call({ url: "/sales", method: "POST", data: payload });
    await refreshSales();
    await refreshProducts();
  };
  const addSalePayment = async (payload) => {
    await call({
      url: `/sales/${payload.invoiceId}/payments`,
      method: "POST",
      data: {
        amount: Number(payload.amount),
        paymentMethod: payload.paymentMethod,
      },
    });
    await refreshSales();
  };
  const createReturn = async (payload) => {
    await call({
      url: `/sales/${payload.invoiceId}/returns`,
      method: "POST",
      data: {
        items: payload.items,
        refundAmount: payload.refundAmount,
        refundMethod: payload.refundMethod,
        reason: payload.reason,
      },
    });
    await refreshSales();
    await refreshProducts();
  };
  const createExpense = async (payload) => {
    const formData = new FormData();
    formData.append("branchId", payload.branchId);
    formData.append("categoryId", payload.categoryId);
    formData.append("amount", payload.amount);
    formData.append("expenseDate", payload.expenseDate);
    formData.append("paymentMethod", payload.paymentMethod);
    formData.append("description", payload.description);
    if (payload.receipt) {
      formData.append("receipt", payload.receipt);
    }
    await call({
      url: "/expenses",
      method: "POST",
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
    });
    await refreshExpenses();
  };
  const createTransfer = async (payload) => {
    await call({ url: "/transfers", method: "POST", data: payload });
    await refreshTransfers();
    await refreshProducts();
  };
  const createBranch = async (payload) => {
    await call({ url: "/branches", method: "POST", data: payload });
    await loadCore();
    await loadBranchData();
  };
  const createUser = async (payload) => {
    await call({ url: "/users", method: "POST", data: payload });
    await refreshUsers();
  };
  const loadAccounts = async () => {
    const result = await call({ url: "/finance/accounts", params: branchParams });
    setAccounts(result);
    return result;
  };
  const saveAccounts = async (payload) => {
    const result = await call({
      url: "/finance/accounts",
      method: "PUT",
      data: payload,
    });
    setAccounts(result);
    await loadBranchData();
  };
  const adjustAccount = async (payload) => {
    const result = await call({
      url: "/finance/accounts/adjust",
      method: "POST",
      data: payload,
    });
    setAccounts(result?.balances || accounts);
    await loadBranchData();
  };
  const loadAuditLogs = async () => {
    const logs = await call({ url: "/audit-logs" });
    setAuditLogs(logs);
  };
  const createBackup = async () => {
    await call({ url: "/system/backup", method: "POST", data: {} });
    await loadAdminData();
  };
  const restoreBackup = async (fileName) => {
    await call({ url: "/system/restore", method: "POST", data: { fileName } });
    await loadAdminData();
    await loadBranchData();
  };
  const loadReports = async (range) => {
    const params = {
      ...branchParams,
      from: range?.from || undefined,
      to: range?.to || undefined,
    };
    const [
      profit,
      bestSelling,
      slowMoving,
      expenseReport,
      branchSummary,
      accountsReceivable,
      accountsPayable,
      cashFlow,
      incomeStatement,
    ] = await Promise.all([
      call({ url: "/reports/profit", params }),
      call({ url: "/reports/best-selling", params }),
      call({ url: "/reports/slow-moving", params }),
      call({ url: "/reports/expenses", params }),
      call({ url: "/reports/branch-summary", params }),
      call({ url: "/reports/accounts-receivable", params }),
      call({ url: "/reports/accounts-payable", params }),
      call({ url: "/reports/cash-flow", params }),
      call({ url: "/reports/income-statement", params }),
    ]);
    setReports((prev) => ({
      ...prev,
      profit,
      bestSelling,
      slowMoving,
      expenses: expenseReport,
      branchSummary,
      accountsReceivable,
      accountsPayable,
      cashFlow,
      incomeStatement,
    }));
  };

  if (!session) {
    return <LoginPage onLogin={onLogin} />;
  }

  const data = { user, selectedBranchId };
  const activeTitle = pageTitles[location.pathname] || "Dable Retail Suite";
  const availableNav = navItems.filter((item) => !item.roles || item.roles.includes(user?.role));

  return (
    <main className="app-shell wide">
      <aside className="side-panel">
        <div className="brand-panel">
          <h1>Dable</h1>
          <p>Retail Suite</p>
        </div>
        <nav className="side-nav">
          {availableNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <span>{branches.length} Branches</span>
          <span>{products.length} Products</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <h2>{activeTitle}</h2>
            <p>
              {user?.fullName} ({user?.role}) {status ? `| ${status}` : ""}
            </p>
            {error ? <p className="error-text">{error}</p> : null}
          </div>
          <div className="top-actions">
            {user?.role === "ADMIN" ? (
              <select
                value={selectedBranchId || ""}
                onChange={(e) => setSelectedBranchId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="" disabled>
                  Select branch
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="chip">{user?.branchName}</span>
            )}
            <button onClick={refreshWorkspace}>Refresh</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="hero-ribbon">
          <strong>Invoice-first retail operation</strong>
          <span>Connected modules: stock, purchases, sales, expenses, accounts, transfers, reporting</span>
        </section>

        <section className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <DashboardTab
                  dashboard={reports.dashboard}
                  dailySales={reports.dailySales}
                  accounts={accounts}
                />
              }
            />
            <Route
              path="/products"
              element={
                <ProductsTab
                  data={data}
                  branches={branches}
                  categories={categories}
                  units={units}
                  suppliers={suppliers}
                  products={products}
                  lowStock={lowStock}
                  onCreateProduct={createProduct}
                  onAdjustStock={adjustStock}
                  onReloadProducts={refreshProducts}
                />
              }
            />
            <Route
              path="/purchases"
              element={
                <PurchasesTab
                  data={data}
                  branches={branches}
                  suppliers={suppliers}
                  products={products}
                  purchases={purchases}
                  accounts={accounts}
                  onCreateSupplier={createSupplier}
                  onCreatePurchase={createPurchase}
                  onAddPurchasePayment={addPurchasePayment}
                  onReloadPurchases={refreshPurchases}
                />
              }
            />
            <Route
              path="/sales"
              element={
                <SalesTab
                  data={data}
                  branches={branches}
                  customers={customers}
                  products={products}
                  sales={sales}
                  onCreateCustomer={createCustomer}
                  onCreateSale={createSale}
                  onAddSalePayment={addSalePayment}
                  onCreateReturn={createReturn}
                  onLoadCustomerLedger={loadCustomerLedger}
                  onReloadSales={refreshSales}
                />
              }
            />
            <Route
              path="/expenses"
              element={
                <ExpensesTab
                  data={data}
                  branches={branches}
                  expenseCategories={expenseCategories}
                  expenses={expenses}
                  accounts={accounts}
                  onCreateExpense={createExpense}
                  onReloadExpenses={refreshExpenses}
                />
              }
            />
            <Route
              path="/transfers"
              element={
                <TransfersTab
                  branches={branches}
                  products={products}
                  transfers={transfers}
                  onCreateTransfer={createTransfer}
                  onReloadTransfers={refreshTransfers}
                />
              }
            />
            <Route
              path="/accounts"
              element={
                user?.role === "ADMIN" || user?.role === "MANAGER" ? (
                  <AccountsTab
                    data={data}
                    branches={branches}
                    accounts={accounts}
                    onLoadAccounts={loadAccounts}
                    onSaveAccounts={saveAccounts}
                    onAdjustAccount={adjustAccount}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route path="/reports" element={<ReportsTab reports={reports} onLoadReports={loadReports} />} />
            <Route
              path="/admin"
              element={
                user?.role === "ADMIN" || user?.role === "MANAGER" ? (
                  <AdminTab
                    data={data}
                    roles={roles}
                    branches={branches}
                    users={users}
                    auditLogs={auditLogs}
                    backups={backups}
                    onCreateBranch={createBranch}
                    onCreateUser={createUser}
                    onLoadAuditLogs={loadAuditLogs}
                    onCreateBackup={createBackup}
                    onRestoreBackup={restoreBackup}
                    onReloadUsers={refreshUsers}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </section>
      </section>
    </main>
  );
}

export default App;
