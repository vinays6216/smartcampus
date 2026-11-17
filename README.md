# Smart Campus Management System

Smart Campus is a web application for managing academic operations across students, lecturers, and administrators. It combines a React frontend with a role-protected REST API and a MySQL database.

## Features

- Role-based accounts for students, lecturers, and administrators
- Academic setup for departments, programs, academic years, sections, subjects, and admin-managed MCA Semester 3 specializations
- Lecturer teaching assignments and student rosters
- Timetables, study materials, announcements, and calendar events
- Attendance marking, student summaries, reports, and attendance issue review
- Assignment publishing, file or URL submissions, grading, and deadline alerts
- In-app notifications and secure, authorized file downloads
- Admin management of student and lecturer accounts

## Technology

- Frontend: React 18, React Router, Vite, Axios
- Backend: Node.js 18+, Express, MySQL 8+, `mysql2`, JWT, Zod
- File uploads: Multer, stored locally under `backend/uploads/`

## Repository Layout

```text
smartcampus/
	backend/       Express REST API and MySQL integration
	frontend/      React single-page application
	README.md      Project setup and overview
```

The backend is organized by feature modules in `backend/src/modules/`. The frontend screens are in `frontend/src/pages/`, with shared API, authentication, layout, and UI code under `frontend/src/`.

## Requirements

- Node.js 18 or newer and npm
- MySQL 8 or a compatible MySQL server

## Quick Start (Windows)

1. Create the database (see **Database setup** below).
2. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`, then fill in the values.
3. Give the starter admin a password: `cd backend; npm run create-admin -- --email admin@smartcampus.local`.
4. Double-click `start-dev.cmd` (or run `.\start-dev.ps1`). It installs packages on the first run, opens the backend and frontend in two windows, and opens `http://localhost:5173` once the API answers.

## Database setup

The complete schema is in `database/schema.sql`: 27 tables, 3 views (`v_student_subject_attendance`, `v_student_attendance_detail`, `v_student_assignments`), the attendance-history trigger, 3 stored procedures (`sp_attendance_report`, `sp_publish_assignment`, `sp_create_deadline_reminders`) and the hourly `ev_deadline_reminders` event. It creates the `smart_campus` database itself and is safe to run again.

Starter data: department CS, program MCA (specializations WAD, DS and AIML from semester 3), academic year 2026-27, and the admin `admin@smartcampus.local` with a placeholder password hash that matches no password (set one with `npm run create-admin`, below).

Run it as the MySQL root user (MySQL Workbench: File → Open SQL Script → run all with Ctrl+Shift+Enter, or the command line):

```powershell
mysql -u root -p < database/schema.sql
mysql -u root -p < database/migrations/001_timetable_slots.sql
mysql -u root -p < database/migrations/002_admin_permissions.sql
mysql -u root -p < database/migrations/003_leave_requests.sql
mysql -u root -p < database/migrations/004_internal_marks.sql
```

`database/migrations/` holds additions made after the original schema (run each file once, in order; they are safe to run again).
`001_timetable_slots.sql` adds the weekly timetable grid. `002_admin_permissions.sql` adds the platform admin and per-admin
permissions: the starter admin `admin@smartcampus.local` becomes the platform admin, other existing admins keep full rights.
The platform admin (menu **Platform Admins**) creates admins and ticks what each may use: students & lecturers, academic
setup, timetables, attendance, announcements & calendar, assignments & materials. Locked out? `npm run create-admin -- --email <admin> --platform`.
`003_leave_requests.sql` adds student leave requests (approval turns absent marks on those days into excused).
`004_internal_marks.sql` adds internal marks (tests, quizzes, labs; published to students). Existing databases only need the migration files.

Then, still as root, turn on the event scheduler (deadline reminders) and create a limited account for the app:

```sql
SET GLOBAL event_scheduler = ON;   -- to keep it after a restart, add event_scheduler=ON under [mysqld] in my.ini
CREATE USER '<app_user>'@'localhost' IDENTIFIED BY '<strong password>';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON smart_campus.* TO '<app_user>'@'localhost';
```

Put that user and password in `backend/.env` (`DB_USER`, `DB_PASSWORD`).

Attendance rule used everywhere: **percentage = (present + late) ÷ (classes held − excused) × 100**, minimum `ATTENDANCE_MIN_PERCENT` (75). It is calculated by the database, so approved corrections update it immediately.

## Local Development

### 1. Configure the backend

Copy `backend/.env.example` to `backend/.env` and fill in your local MySQL connection and a long, random JWT secret:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=smart_campus

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
UPLOAD_DIR=uploads
ATTENDANCE_ISSUE_WINDOW_DAYS=7
ATTENDANCE_MIN_PERCENT=75
```

`DB_HOST`, `DB_USER`, `DB_NAME`, and `JWT_SECRET` are required. Keep `.env` files and real secrets out of Git.

Install dependencies and start the API:

```powershell
cd backend
npm install
npm run dev
```

For a non-watch server, use `npm start`. The API listens on `http://localhost:5000`; check `http://localhost:5000/api/health` to verify it is running.

### 2. Configure the frontend

Copy `frontend/.env.example` to `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Install dependencies and start Vite:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The backend's `CLIENT_URL` must match the frontend origin for CORS.

### 3. Create the initial admin account

There is no public sign-up. From the `backend` folder:

```powershell
npm run create-admin -- --email admin@smartcampus.local
```

This sets a password for the starter admin created by the schema. To add another admin instead, give a new email and a name: `npm run create-admin -- --email admin@college.edu --name "Admin Name"` (optional `--code <employee code>`, default `ADM` + user id, and `--designation <text>`).

Without `ADMIN_PASSWORD` set, the script prints a one-time temporary password and the admin must change it at first sign-in. The script uses the database settings in `backend/.env`.

After logging in, create academic setup records first, then lecturers, students, and teaching assignments.

## Scripts

Run these commands from the relevant package directory.

| Directory | Command | Description |
|---|---|---|
| `backend` | `npm run dev` | Start API with automatic restart |
| `backend` | `npm start` | Start API |
| `backend` | `npm test` | Unit and route tests (no database needed) |
| GitHub | `.github/workflows/ci.yml` | On every push / pull request: backend tests, frontend build, and the smoke test against a throwaway MySQL |
| `backend` | `npm run smoke` | End-to-end test of the whole workflow — **throwaway database only** (see backend/README.md) |
| `backend` | `npm run create-admin -- --email …` | Set the starter admin's password (or `--name …` to add an admin) |
| repo root | `start-dev.cmd` / `.\start-dev.ps1` | Start backend + frontend in two windows |
| `frontend` | `npm run dev` | Start Vite development server |
| `frontend` | `npm run build` | Build the frontend into `frontend/dist/` |
| `frontend` | `npm run preview` | Preview the production build locally |

## API Overview

The API base path is `/api`. Login at `POST /api/auth/login` to obtain a bearer token; protected requests use `Authorization: Bearer <token>`. JSON uses camelCase fields. Responses follow a success envelope such as `{ "success": true, "data": ... }` and an error envelope such as `{ "success": false, "message": "..." }`.

Feature route groups include:

| Area | Route prefix |
|---|---|
| Authentication and profiles | `/api/auth`, `/api/admin` |
| Academic setup and teaching | `/api/academic`, `/api/teaching` |
| Timetables and attendance | `/api/timetables`, `/api/attendance` |
| Assignments and materials | `/api/assignments`, `/api/materials` |
| Announcements and calendar | `/api/announcements`, `/api/calendar` |
| Notifications, dashboard, files | `/api/notifications`, `/api/dashboard`, `/api/files` |

Role and ownership checks restrict access to the appropriate users and classes. Uploaded files are accessed through the API, which checks authorization before download or preview.

## Important Notes

- The backend stores uploads locally. For deployment, configure persistent storage and backups for `backend/uploads/`.
- Use a unique production `JWT_SECRET`, a restricted database account, HTTPS, and production-appropriate CORS settings.
- The hourly assignment deadline reminder depends on the MySQL event `ev_deadline_reminders`; enable the MySQL event scheduler where that feature is required.
- Scheduled announcements: the backend checks every minute and notifies the audience once the publish time has passed (announcements that went live in the last 7 days; each is notified once).

## Component Documentation

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` / `development` and on pull requests:

1. **Backend tests** — `npm test` (no database).
2. **Frontend build** — `npm run build`.
3. **End-to-end smoke test** — starts a throwaway MySQL 8 service, loads `database/schema.sql` and every migration
   (twice, to prove they are re-runnable), starts the API and runs `npm run smoke` (~180 checks).

Only throwaway values are used in the workflow; no repository secrets are needed.

## PDF reports

Attendance Report → **Printable reports (PDF)**: class register, class shortage list, section shortage list
(college name, signature lines, page numbers). Set the college name in `frontend/.env`:
`VITE_COLLEGE_NAME=Your College Name`.
