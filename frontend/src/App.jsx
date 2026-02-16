import { useCallback, useEffect, useMemo, useState } from "react";
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

const SESSION_KEY = "dable-session";

const tabs = [
  { id: "dashboard", label: "Dashboard" },
  { id: "products", label: "Products & Stock" },
  { id: "purchases", label: "Suppliers & Purchases" },
  { id: "sales", label: "Customers & Sales" },
  { id: "expenses", label: "Expenses" },
  { id: "transfers", label: "Transfers" },
  { id: "reports", label: "Reports" },
  { id: "admin", label: "Admin & Backup" },
];

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
  const [session, setSession] = useState(storedSession);
  const [activeTab, setActiveTab] = useState("dashboard");
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
  const [reports, setReports] = useState({
    dashboard: null,
    dailySales: null,
    profit: null,
    bestSelling: [],
    slowMoving: [],
    expenses: null,
    branchSummary: { branches: [] },
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

    if (!selectedBranchId && me.branchId) {
      setSelectedBranchId(me.branchId);
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
    const [supplierList, customerList, productList, lowStockList, purchaseList, salesList, expenseList, transferList, dashboard, dailySales] =
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
      ]);
    setSuppliers(supplierList);
    setCustomers(customerList);
    setProducts(productList);
    setLowStock(lowStockList);
    setPurchases(purchaseList);
    setSales(salesList);
    setExpenses(expenseList);
    setTransfers(transferList);
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
        setStatus("Loading core data...");
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
        setStatus("Loading branch data...");
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
  const createUser = async (payload) => {
    await call({ url: "/users", method: "POST", data: payload });
    await refreshUsers();
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
    const [profit, bestSelling, slowMoving, expenseReport, branchSummary] = await Promise.all([
      call({ url: "/reports/profit", params }),
      call({ url: "/reports/best-selling", params }),
      call({ url: "/reports/slow-moving", params }),
      call({ url: "/reports/expenses", params }),
      call({ url: "/reports/branch-summary", params }),
    ]);
    setReports((prev) => ({
      ...prev,
      profit,
      bestSelling,
      slowMoving,
      expenses: expenseReport,
      branchSummary,
    }));
  };

  if (!session) {
    return <LoginPage onLogin={onLogin} />;
  }

  const data = { user, selectedBranchId };

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>Dable Retail Suite</h1>
          <p>
            {user?.fullName} ({user?.role}) {status ? `| ${status}` : ""}
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
        <div className="top-actions">
          {user?.role === "ADMIN" ? (
            <select value={selectedBranchId || ""} onChange={(e) => setSelectedBranchId(Number(e.target.value))}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="chip">{user?.branchName}</span>
          )}
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="content">
        {activeTab === "dashboard" ? (
          <DashboardTab dashboard={reports.dashboard} dailySales={reports.dailySales} />
        ) : null}

        {activeTab === "products" ? (
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
        ) : null}

        {activeTab === "purchases" ? (
          <PurchasesTab
            data={data}
            branches={branches}
            suppliers={suppliers}
            products={products}
            purchases={purchases}
            onCreateSupplier={createSupplier}
            onCreatePurchase={createPurchase}
            onAddPurchasePayment={addPurchasePayment}
            onReloadPurchases={refreshPurchases}
          />
        ) : null}

        {activeTab === "sales" ? (
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
            onReloadSales={refreshSales}
          />
        ) : null}

        {activeTab === "expenses" ? (
          <ExpensesTab
            data={data}
            branches={branches}
            expenseCategories={expenseCategories}
            expenses={expenses}
            onCreateExpense={createExpense}
            onReloadExpenses={refreshExpenses}
          />
        ) : null}

        {activeTab === "transfers" ? (
          <TransfersTab
            branches={branches}
            products={products}
            transfers={transfers}
            onCreateTransfer={createTransfer}
            onReloadTransfers={refreshTransfers}
          />
        ) : null}

        {activeTab === "reports" ? <ReportsTab reports={reports} onLoadReports={loadReports} /> : null}

        {activeTab === "admin" ? (
          <AdminTab
            data={data}
            roles={roles}
            branches={branches}
            users={users}
            auditLogs={auditLogs}
            backups={backups}
            onCreateUser={createUser}
            onLoadAuditLogs={loadAuditLogs}
            onCreateBackup={createBackup}
            onRestoreBackup={restoreBackup}
            onReloadUsers={refreshUsers}
          />
        ) : null}
      </section>
    </main>
  );
}

export default App;
