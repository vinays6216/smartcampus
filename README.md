# Smart Campus Management System

Smart Campus is a web application for managing academic operations across students, lecturers, and administrators. It combines a React frontend with a role-protected REST API and a MySQL database.

## Features

- Role-based accounts for students, lecturers, and administrators
- Academic setup for departments, programs, academic years, sections, and subjects
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
- A database schema matching the Smart Campus API

> **Database setup:** The SQL schema is not included in this repository. Create/import the Smart Campus schema in MySQL before starting the backend, then set `DB_NAME` in `backend/.env` to that database name. The backend component README refers to `smart_campus`.

## Local Development

### 1. Configure the backend

Create `backend/.env` with your local MySQL connection and a long, random JWT secret:

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

Create `frontend/.env`:

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

There is no public sign-up. Create an admin account in the database using the schema's required user and admin profile records. Passwords must be bcrypt hashes; you can generate one from the backend directory with:

```powershell
node -e "console.log(require('bcryptjs').hashSync('ChangeThisPassword', 10))"
```

Insert the generated hash for the admin account according to your database schema. After logging in, create academic setup records first, then lecturers, students, and teaching assignments.

## Scripts

Run these commands from the relevant package directory.

| Directory | Command | Description |
|---|---|---|
| `backend` | `npm run dev` | Start API with automatic restart |
| `backend` | `npm start` | Start API |
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
- Scheduled announcements are stored, but notifications are sent only when an announcement is published immediately.

## Component Documentation

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
