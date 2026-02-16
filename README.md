# Dable Shop Management System (Local)

Full local web app for invoice-based retail management.

## Stack
- Frontend: React + Vite (`frontend`)
- Backend: Express + Prisma (`backend`)
- Database: SQLite file (`backend/prisma/dev.db`)

## Modules Included
- Auth + roles (Admin, Manager, Cashier, Stock Keeper)
- Product catalog + SKU + units + categories
- Stock tracking + FIFO batch consumption + low-stock + expiry alerts
- Suppliers + purchases + incoming stock + supplier payment tracking
- Customers + invoice sales + discounts + returns + customer credit ledger
- Expense tracking + receipt attachments
- Branch transfer + branch-level reporting
- Audit logs + database backup/restore
- Daily sales / profit / best-selling / slow-moving / expense reports

## Quick Start
1. Install all dependencies:
```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```
2. Run database migration:
```bash
npm run migrate
```
3. Seed demo data:
```bash
npm run seed
```
4. Start backend + frontend:
```bash
npm run dev
```
5. Open:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api/health`

## Demo Login
- Username: `admin`
- Password: `admin123`

## Important Files
- Database schema: `backend/prisma/schema.prisma`
- Prisma config: `backend/prisma.config.ts`
- API server: `backend/src/server.js`
- Frontend app: `frontend/src/App.jsx`

## Backup
- Create backup in Admin tab, or call `POST /api/system/backup`.
- Backups are stored in `backend/backups`.
- Restore with `POST /api/system/restore`.
