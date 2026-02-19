import { useState } from "react";
import { Panel, InlineError } from "../components/Panel";

export default function AdminTab({
  data,
  roles,
  branches,
  users,
  auditLogs,
  backups,
  onCreateBranch,
  onCreateUser,
  onLoadAuditLogs,
  onCreateBackup,
  onRestoreBackup,
  onReloadUsers,
}) {
  const isAdmin = data.user?.role === "ADMIN";
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  return (
    <div className="tab-grid">
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
        {success ? <p className="success-note">{success}</p> : null}
        <InlineError message={error} />
      </Panel>

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
