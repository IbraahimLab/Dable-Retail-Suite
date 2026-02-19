import { useMemo, useState } from "react";
import { Panel, InlineError } from "../components/Panel";

function toDateInput(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

const monthOptions = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function AdminTab({
  data,
  roles,
  branches,
  users,
  company,
  setupStatus,
  ownerWithdrawals,
  auditLogs,
  backups,
  onCreateBranch,
  onCreateUser,
  onSaveCompanyProfile,
  onCreateOwnerWithdrawal,
  onLoadOwnerWithdrawals,
  onLoadAuditLogs,
  onCreateBackup,
  onRestoreBackup,
  onReloadUsers,
}) {
  const isAdmin = data.user?.role === "ADMIN";
  const canManageCompany = data.user?.role === "ADMIN" || data.user?.role === "MANAGER";
  const effectiveBranchId = useMemo(() => {
    if (data.user?.role === "ADMIN") {
      return Number(data.selectedBranchId || 0);
    }
    return Number(data.user?.branchId || 0);
  }, [data.selectedBranchId, data.user?.branchId, data.user?.role]);
  const [userForm, setUserForm] = useState({
    username: "",
    fullName: "",
    password: "admin123",
    roleCode: "",
    branchId: "",
  });
  const [branchForm, setBranchForm] = useState({
    code: "",
    name: "",
    address: "",
    phone: "",
    isActive: true,
  });
  const [companyOverrides, setCompanyOverrides] = useState({});
  const [withdrawalForm, setWithdrawalForm] = useState({
    branchId: "",
    amount: "",
    paymentMethod: "CASH",
    withdrawnAt: toDateInput(new Date()),
    note: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const baseCompanyForm = useMemo(
    () => ({
      name: company?.name || "",
      legalName: company?.legalName || "",
      registrationNumber: company?.registrationNumber || "",
      taxNumber: company?.taxNumber || "",
      phone: company?.phone || "",
      email: company?.email || "",
      address: company?.address || "",
      currency: company?.currency || "USD",
      startDate: toDateInput(company?.startDate),
      fiscalYearStartMonth: String(company?.fiscalYearStartMonth || 1),
      openingCapital: String(Number(company?.openingCapital || 0)),
      ownerName: company?.ownerName || "",
    }),
    [company],
  );
  const companyForm = useMemo(
    () => ({
      ...baseCompanyForm,
      ...companyOverrides,
    }),
    [baseCompanyForm, companyOverrides],
  );
  const withdrawalBranchValue =
    withdrawalForm.branchId || (effectiveBranchId ? String(effectiveBranchId) : "");

  const submitUser = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await onCreateUser({
        ...userForm,
        branchId: userForm.branchId ? Number(userForm.branchId) : null,
      });
      setUserForm({
        username: "",
        fullName: "",
        password: "admin123",
        roleCode: "",
        branchId: "",
      });
      setSuccess("User created.");
    } catch (err) {
      setError(err.message);
    }
  };

  const submitBranch = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await onCreateBranch({
        ...branchForm,
      });
      setBranchForm({
        code: "",
        name: "",
        address: "",
        phone: "",
        isActive: true,
      });
      setSuccess("Branch created.");
    } catch (err) {
      setError(err.message);
    }
  };

  const submitCompany = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await onSaveCompanyProfile({
        ...companyForm,
        fiscalYearStartMonth: Number(companyForm.fiscalYearStartMonth || 1),
        openingCapital: Number(companyForm.openingCapital || 0),
        startDate: companyForm.startDate || null,
      });
      setCompanyOverrides({});
      setSuccess("Company setup saved.");
    } catch (err) {
      setError(err.message);
    }
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await onCreateOwnerWithdrawal({
        branchId: Number(withdrawalBranchValue),
        amount: Number(withdrawalForm.amount || 0),
        paymentMethod: withdrawalForm.paymentMethod,
        withdrawnAt: withdrawalForm.withdrawnAt || null,
        note: withdrawalForm.note || null,
      });
      setWithdrawalForm((prev) => ({
        ...prev,
        amount: "",
        note: "",
      }));
      await onLoadOwnerWithdrawals();
      setSuccess("Owner withdrawal recorded.");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tab-grid">
      {canManageCompany ? (
        <Panel title="Company Setup" subtitle="Define company profile and fiscal start">
          <form className="grid-form multi" onSubmit={submitCompany}>
            <label>
              Company Name
              <input
                value={companyForm.name}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Owner Name
              <input
                value={companyForm.ownerName}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, ownerName: e.target.value }))}
              />
            </label>
            <label>
              Legal Name
              <input
                value={companyForm.legalName}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, legalName: e.target.value }))}
              />
            </label>
            <label>
              Registration No
              <input
                value={companyForm.registrationNumber}
                onChange={(e) =>
                  setCompanyOverrides((p) => ({ ...p, registrationNumber: e.target.value }))
                }
              />
            </label>
            <label>
              Tax Number
              <input
                value={companyForm.taxNumber}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, taxNumber: e.target.value }))}
              />
            </label>
            <label>
              Start Date
              <input
                type="date"
                value={companyForm.startDate}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, startDate: e.target.value }))}
              />
            </label>
            <label>
              Fiscal Year Start
              <select
                value={companyForm.fiscalYearStartMonth}
                onChange={(e) =>
                  setCompanyOverrides((p) => ({ ...p, fiscalYearStartMonth: e.target.value }))
                }
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Opening Capital
              <input
                type="number"
                min="0"
                step="0.01"
                value={companyForm.openingCapital}
                onChange={(e) =>
                  setCompanyOverrides((p) => ({ ...p, openingCapital: e.target.value }))
                }
              />
            </label>
            <label>
              Currency
              <input
                value={companyForm.currency}
                onChange={(e) =>
                  setCompanyOverrides((p) => ({ ...p, currency: e.target.value.toUpperCase() }))
                }
              />
            </label>
            <label>
              Phone
              <input
                value={companyForm.phone}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, phone: e.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                value={companyForm.email}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, email: e.target.value }))}
              />
            </label>
            <label>
              Address
              <input
                value={companyForm.address}
                onChange={(e) => setCompanyOverrides((p) => ({ ...p, address: e.target.value }))}
              />
            </label>
            <button type="submit">Save Company Setup</button>
          </form>
          {setupStatus ? (
            <div className="chips">
              <span className={`chip ${setupStatus.companyProfileReady ? "" : "danger"}`}>
                Profile: {setupStatus.companyProfileReady ? "Ready" : "Pending"}
              </span>
              <span className={`chip ${setupStatus.branchesConfigured ? "" : "danger"}`}>
                Branches: {setupStatus.branchesConfigured ? "Ready" : "Pending"}
              </span>
              <span className={`chip ${setupStatus.startupBalancesConfigured ? "" : "danger"}`}>
                Startup Balances: {setupStatus.startupBalancesConfigured ? "Ready" : "Pending"}
              </span>
              <span className={`chip ${setupStatus.readyToOperate ? "" : "danger"}`}>
                Operation: {setupStatus.readyToOperate ? "Ready" : "Not Ready"}
              </span>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {isAdmin ? (
        <Panel
          title="Branch Management"
          subtitle="Admins can add new branches"
        >
          <form className="grid-form multi" onSubmit={submitBranch}>
            <label>
              Code
              <input
                value={branchForm.code}
                onChange={(e) => setBranchForm((p) => ({ ...p, code: e.target.value }))}
                required
              />
            </label>
            <label>
              Name
              <input
                value={branchForm.name}
                onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Address
              <input
                value={branchForm.address}
                onChange={(e) => setBranchForm((p) => ({ ...p, address: e.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                value={branchForm.phone}
                onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </label>
            <button type="submit">Create Branch</button>
          </form>
        </Panel>
      ) : null}

      {canManageCompany ? (
        <Panel
          title="Owner Withdrawals"
          subtitle="Record owner draw and reduce branch account balance"
          actions={<button onClick={onLoadOwnerWithdrawals}>Refresh Withdrawals</button>}
        >
          <form className="grid-form multi" onSubmit={submitWithdrawal}>
            <label>
              Branch
              <select
                value={withdrawalBranchValue}
                onChange={(e) => setWithdrawalForm((p) => ({ ...p, branchId: e.target.value }))}
                disabled={!isAdmin}
              >
                <option value="">Select</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={withdrawalForm.amount}
                onChange={(e) => setWithdrawalForm((p) => ({ ...p, amount: e.target.value }))}
                required
              />
            </label>
            <label>
              Account
              <select
                value={withdrawalForm.paymentMethod}
                onChange={(e) => setWithdrawalForm((p) => ({ ...p, paymentMethod: e.target.value }))}
              >
                <option value="CASH">CASH</option>
                <option value="BANK">BANK</option>
                <option value="CARD">CARD</option>
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={withdrawalForm.withdrawnAt}
                onChange={(e) => setWithdrawalForm((p) => ({ ...p, withdrawnAt: e.target.value }))}
              />
            </label>
            <label>
              Note
              <input
                value={withdrawalForm.note}
                onChange={(e) => setWithdrawalForm((p) => ({ ...p, note: e.target.value }))}
              />
            </label>
            <button type="submit">Record Withdrawal</button>
          </form>
          <div className="kpi-row">
            <div>
              <span>Total Records</span>
              <strong>{Number(ownerWithdrawals?.count || 0)}</strong>
            </div>
            <div>
              <span>Total Withdrawn</span>
              <strong>${Number(ownerWithdrawals?.totalAmount || 0).toFixed(2)}</strong>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Branch</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Created By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(ownerWithdrawals?.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.withdrawnAt).toLocaleDateString()}</td>
                    <td>{item.branch?.name || "-"}</td>
                    <td>{item.paymentMethod}</td>
                    <td>${Number(item.amount || 0).toFixed(2)}</td>
                    <td>{item.createdBy?.username || "-"}</td>
                    <td>{item.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="User & Role Management"
        subtitle={`Signed in as ${data.user?.role || ""}`}
        actions={<button onClick={onReloadUsers}>Refresh Users</button>}
      >
        {isAdmin ? (
          <form className="grid-form multi" onSubmit={submitUser}>
            <label>
              Username
              <input
                value={userForm.username}
                onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))}
                required
              />
            </label>
            <label>
              Full Name
              <input
                value={userForm.fullName}
                onChange={(e) => setUserForm((p) => ({ ...p, fullName: e.target.value }))}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
                required
              />
            </label>
            <label>
              Role
              <select
                value={userForm.roleCode}
                onChange={(e) => setUserForm((p) => ({ ...p, roleCode: e.target.value }))}
                required
              >
                <option value="">Select</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Branch
              <select
                value={userForm.branchId}
                onChange={(e) => setUserForm((p) => ({ ...p, branchId: e.target.value }))}
              >
                <option value="">Select</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Create User</button>
          </form>
        ) : (
          <p className="muted-note">Only Admin can create users.</p>
        )}
      </Panel>

      {success ? <p className="success-note">{success}</p> : null}
      <InlineError message={error} />

      <Panel title={`Users (${users.length})`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.fullName}</td>
                  <td>{u.role}</td>
                  <td>{u.branchName || "-"}</td>
                  <td>{u.isActive ? "Active" : "Disabled"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Audit Logs"
        actions={<button onClick={onLoadAuditLogs}>Load Logs</button>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.user?.username || "-"}</td>
                  <td>{log.action}</td>
                  <td>{log.entityType}</td>
                  <td>{log.entityId || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Backups"
        actions={<button onClick={onCreateBackup}>Create Backup</button>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>File</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.createdAt).toLocaleString()}</td>
                  <td>{b.fileName}</td>
                  <td>{(Number(b.sizeBytes || 0) / 1024).toFixed(2)} KB</td>
                  <td className="inline-actions">
                    <a href={`http://localhost:4000${b.downloadUrl}`} target="_blank" rel="noreferrer">
                      Download
                    </a>
                    <button type="button" onClick={() => onRestoreBackup(b.fileName)}>
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
