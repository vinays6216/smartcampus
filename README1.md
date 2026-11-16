# Smart Campus Management System

**Web Based Smart Campus Management System with integrated Academic Management**

A web portal that puts the daily academic work of a college in one place. Students, lecturers and the admin office log in to the same system and each sees only what belongs to their role.

| Layer | Technology | Delivered as |
|---|---|---|
| Database | MySQL 8 (MySQL Workbench) | `smart_campus_schema.sql` |
| Backend | Node.js, Express, mysql2, JWT, multer, zod | `smart-campus-backend.zip` |
| Frontend | React 18, Vite, React Router, axios | `smart-campus-frontend.zip` |

---

## 1. Features

### Student
- **Attendance:** subject-wise percentage, overall percentage, and a day-by-day list showing which days he was absent and which days he attended. Absent days can be filtered by date, subject and status.
- **Attendance issue:** if a lecturer marked him absent by mistake, he raises an issue (reason plus optional proof). He can withdraw an open issue and sees the lecturer's decision.
- **Assignments:** list of assignments with deadlines, a countdown, and status tags (Pending, Due soon, Overdue, Submitted). Alerts appear on the dashboard and in the notification bell.
- **Submitting:** the "I have submitted manually" button, an online link, or a PDF upload. A submission can be taken back to "not submitted" before the deadline and before grading.
- **Time table:** view the active time table uploaded by the admin.
- **Study materials:** view or download PDF, PPT and DOC files uploaded by lecturers.
- **Announcements and calendar:** messages from lecturers and the admin, and a month calendar with extra classes, special classes, exams and holidays.

### Lecturer
- **Mark attendance:** choose class, date and period; everybody starts as present; set absent, late or excused; edit later (every change is logged).
- **Attendance report:** percentage of every student between a from date and a to date, with a "below X %" filter, sorting and CSV export.
- **Attendance issues:** approve (student becomes present) or reject with remarks.
- **Assignments:** create a draft with a deadline and attachments, publish it (students are notified and the deadline shows as an alert), see who submitted and who did not, and grade.
- **Study materials:** upload PDF, PPT, PPTX, DOC, DOCX; hide or show later.
- **Announcements and calendar:** announce to a section he teaches and optionally add an extra class or special class to the calendar with date and time.
- **Time table:** view only.

### Admin
- Upload time tables per section (the previous one is deactivated automatically).
- View, add and edit every student and lecturer; change status; reset passwords.
- Set up departments, programs, academic years, sections and subjects.
- Assign lecturers to subjects and sections (teaching assignments).
- See and manage assignments of all lecturers; see all attendance issues and reports.
- Post announcements to everyone, students, lecturers, a department or a section.

---

## 2. Project folders

```
smart-campus/
  smart_campus_schema.sql          MySQL script: database, 27 tables, 3 views, 1 trigger, 3 procedures, 1 event, starter data (new installs)
  migration_001_specializations.sql  only for databases created before specializations were added (keeps your data)
  smart-campus-backend/            Node.js + Express API
  smart-campus-frontend/           React + Vite web app
  README.md                        this file
```

Extract the two zip files next to the SQL script.

### Backend

```
smart-campus-backend/
  server.js                        starts the server after checking the database connection
  package.json   .env.example   .gitignore   README.md
  uploads/                         uploaded files (timetables, materials, assignments, submissions, proofs)
  src/
    app.js                         security, parsers, routes, error handling
    config/       env.js  db.js
    middleware/   auth.js  validate.js  upload.js  camelCase.js  errorHandler.js  notFound.js
    utils/        ApiError  asyncHandler  paging  sql  zodHelpers  profile  ownership
                  files  fileAccess  notify  audit
    routes/       index.js         mounts every module under /api
    modules/      (each module = <name>.routes.js + <name>.controller.js)
      auth  users  academic  teaching  timetable  attendance
      assignments  materials  announcements  calendar  notifications  dashboard  files
```

### Frontend

```
smart-campus-frontend/
  index.html  vite.config.js  package.json  .env.example  README.md
  src/
    main.jsx  App.jsx  index.css
    api/          client.js  files.js
    context/      AuthContext.jsx  ToastContext.jsx
    hooks/        useFetch.js
    utils/        helpers.js  format.js
    components/   ProtectedRoute  Layout  FormModal  Modal  FileButton  ui
    pages/
      auth/       Login  ForgotPassword  ResetPassword  ChangePassword
      Dashboard  Announcements  CalendarPage  Timetable  Materials  Notifications
      student/    Attendance  Assignments  AssignmentDetail
      lecturer/   MarkAttendance  AttendanceReport  AttendanceIssues  ManageAssignments  Submissions
      admin/      Students  Lecturers  Academic  Teaching
```

---

## 3. Requirements

| Tool | Version |
|---|---|
| Node.js | 18 or newer (`node -v`) |
| MySQL Server | **8.0.16 or newer** (`SELECT VERSION();`) |
| MySQL Workbench | any recent version |
| A browser | Chrome, Edge or Firefox |

---

## 4. Setup, step by step

Do the steps in this order: database, backend, frontend.

### Step 1 - Create the database (MySQL Workbench)

1. Open MySQL Workbench and open your local connection (for example *Local instance MySQL80*).
2. **File -> Open SQL Script...** and choose `smart_campus_schema.sql`.
3. Click the lightning bolt (**Ctrl + Shift + Enter**) to run the **whole script**. Do not select a part first.
4. Check the **Output** panel: every line should have a green tick. The script is safe to run again if something failed.
5. In **Navigator -> SCHEMAS** click refresh. `smart_campus` should appear.
6. Turn on the scheduler for the hourly deadline reminders (once, as root):

   ```sql
   SET GLOBAL event_scheduler = ON;
   ```

   To keep it on after a MySQL restart, add `event_scheduler=ON` under `[mysqld]` in `my.ini`.

7. Create a limited user for the application (do not use root in the app):

   ```sql
   CREATE USER 'smartcampus_app'@'localhost' IDENTIFIED BY 'choose_a_strong_password';
   GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON smart_campus.* TO 'smartcampus_app'@'localhost';
   ```

8. Verify what was created:

   ```sql
   SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'smart_campus' AND table_type = 'BASE TABLE';   -- expect 27
   SHOW FULL TABLES IN smart_campus WHERE Table_type = 'VIEW';           -- expect 3 views
   SHOW PROCEDURE STATUS WHERE Db = 'smart_campus';                      -- expect 3 procedures
   ```

   Optional: **Database -> Reverse Engineer...** draws the ER diagram for your project report.

### Step 2 - Set the admin password

The script creates one admin: `admin@smartcampus.local`, with the placeholder password hash `REPLACE_WITH_BCRYPT_HASH` (it matches no password). After step 3 (`npm install`), generate a hash from inside the backend folder:

```bash
node -e "console.log(require('bcryptjs').hashSync('YourAdminPassword', 10))"
```

Then in Workbench:

```sql
UPDATE users SET password_hash = '<paste the hash>', must_change_password = 0
 WHERE email = 'admin@smartcampus.local';
```

If Workbench shows error 1175 (safe update mode), turn it off in **Edit -> Preferences -> SQL Editor -> Safe Updates** and reconnect.

### Step 3 - Start the backend

```bash
cd smart-campus-backend
npm install
cp .env.example .env        # on Windows: copy .env.example .env
```

Edit `.env` (see the table below), then:

```bash
npm run dev                 # auto restart while developing   (or: npm start)
```

Open http://localhost:5000/api/health. You should see `{"success":true,"status":"ok",...}`.

### Step 4 - Start the frontend

```bash
cd smart-campus-frontend
npm install
cp .env.example .env        # on Windows: copy .env.example .env
npm run dev
```

Open http://localhost:5173 and log in as the admin.

### Environment variables

**Backend `.env`**

| Variable | Example | Meaning |
|---|---|---|
| `PORT` | `5000` | API port |
| `CLIENT_URL` | `http://localhost:5173` | Frontend address allowed by CORS. Must match exactly. |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | MySQL server |
| `DB_USER` / `DB_PASSWORD` | `smartcampus_app` / ... | The limited user from step 1 |
| `DB_NAME` | `smart_campus` | Database name |
| `JWT_SECRET` | long random text | Signs login tokens. Never share or commit it. |
| `JWT_EXPIRES_IN` | `1d` | How long a login lasts |
| `UPLOAD_DIR` | `uploads` | Where uploaded files are stored |
| `ATTENDANCE_ISSUE_WINDOW_DAYS` | `7` | Students can raise an attendance issue only within this many days of the class |
| `ATTENDANCE_MIN_PERCENT` | `75` | Minimum attendance used for warnings |

**Frontend `.env`**

| Variable | Example | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | Backend address |

---

## 5. First-time data entry (important order)

Nothing else works until the academic structure and teaching assignments exist.

1. **Academic Setup** (admin), in this order:
   1. Department, then the **program** (for MCA: 4 semesters, *specialization starts in semester 3*).
   2. The program's **specializations**: WAD, DS, AIML (the script already adds these for MCA).
   3. Academic year (mark it current).
   4. **Sections**: Semester 1 and 2 sections are common (no specialization). Semester 3 and 4 sections need one specialization each, for example "Sem 3 - WAD - A".
   5. **Subjects**: common subjects (for example all of Sem 1 and 2) have no specialization; Sem 3 and 4 subjects can be tied to one specialization (for example a Data Science subject).
2. **Lecturers** (admin): add lecturers. The system shows a temporary password once; give it to the lecturer. They must change it at first login.
3. **Students** (admin): add students to a program and section; same temporary password rule.
4. **Teaching Assignments** (admin): link lecturer + subject + section. The subject must belong to the same program and semester as the section. A specialization subject can be taught only to a section of that specialization; a common subject can be taught to any section.
5. **Time Tables** (admin): upload one file per section.

After this, lecturers can mark attendance, post assignments, upload materials and announce; students see everything for their own section.

---

### Specializations (MCA: 2 years, 4 semesters)

- Semester 1 and 2 are common to all students. In semester 3 every student takes one specialization: **WAD** (Web Application Development), **DS** (Data Science) or **AIML** (Artificial Intelligence and Machine Learning).
- The program stores the semester where specializations start (`programs.specialization_start_sem`, 3 for MCA). Sections of that semester and later belong to one specialization; earlier sections do not.
- A student's specialization comes from the section he is in, so there is only one place to change it.
- **Moving students (admin -> Students):** tick the students, press **Move selected**, choose the new section. Use this at every semester change, and in semester 3 to place students into WAD / DS / AIML sections. The students get a notification.
- Because attendance, assignments, materials, time tables and announcements all work per section, each specialization automatically gets its own timetable, subjects, lecturers and study materials.
- Already have a database from before this change? Run `migration_001_specializations.sql` once (it keeps your data) instead of re-creating the database.

## 6. How the main workflows work

**Attendance**
1. Lecturer marks a class: one *attendance session* is created, with one record per student of the section.
2. Percentage = (present + late) divided by (classes minus excused) x 100. It is calculated by the database, not stored, so corrections update it automatically.
3. A student marked absent raises an issue (within the allowed days). The lecturer approves (student becomes present, the old and new status are logged in `attendance_record_history`) or rejects. The student is notified either way.

**Assignments**
1. Lecturer creates a **draft** (invisible to students), then **publishes** it.
2. Publishing creates a "not submitted" row for every active student of the section and notifies them.
3. Within 24 hours of the deadline, an hourly database job sends one reminder to each student who has not submitted.
4. Student submits (manual button, link or PDF). Submissions after the deadline are marked late, or refused if the lecturer disabled late submissions.
5. Lecturer sees submitted / not submitted, grades with marks and feedback; the student is notified.
6. Status flow: draft -> published -> closed.

**Notifications:** every alert (new assignment, deadline reminder, attendance issue, announcement, calendar event, material, time table) is one row in `notifications`; the bell in the top bar shows the unread count.

**Files:** files are stored on the server disk; the database stores only their details. Downloads always go through `GET /api/files/:id`, which checks that the logged-in user is allowed to see that file.

---

## 7. Roles and access

| Feature | Student | Lecturer | Admin |
|---|---|---|---|
| Own attendance, raise issue | Yes | - | - |
| Mark attendance, reports | - | Own classes | Reports only |
| Resolve attendance issues | - | Own classes | Yes |
| View / submit assignments | Yes | - | - |
| Create, publish, grade assignments | - | Own classes | View, close, delete drafts |
| View time table | Yes | Yes | Yes |
| Upload time table | - | - | Yes |
| Upload study material | - | Yes | Hide / show only |
| Download study material | Yes | Yes | Yes |
| Post announcements | - | To own sections | Everyone |
| Manage students, lecturers, academic setup | - | - | Yes |

---

## 8. API summary

Base URL `/api`. Protected routes need `Authorization: Bearer <token>`. Requests and responses use camelCase JSON; success looks like `{ "success": true, "data": ... }`, failure like `{ "success": false, "message": "...", "details": [...] }`.

| Module | Main routes |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `/forgot-password`, `/reset-password` |
| Admin users | `/admin/students`, `/admin/lecturers` (list, get, create, update, `/:id/status`), `POST /admin/users/:userId/reset-password` |
| Academic | `/academic/departments`, `programs`, `academic-years`, `sections`, `subjects` (GET for all users, write for admin) |
| Teaching | `GET/POST /teaching`, `DELETE /teaching/:id`, `GET /teaching/:id/roster` |
| Timetable | `GET /timetables`, `POST /timetables` (upload), `PATCH /timetables/:id/deactivate` |
| Attendance | `/attendance/student/summary`, `/student/detail`, `POST /attendance/issues`, `/issues/mine`, `POST /attendance/sessions`, `PUT /sessions/:id/records`, `GET /attendance/report`, `/attendance/issues`, `PATCH /issues/:id/resolve` |
| Assignments | `/assignments/manage...` (lecturer, admin), `/assignments/student...` (student) |
| Materials | `GET/POST /materials`, `PUT/DELETE /materials/:id` |
| Announcements | `GET/POST /announcements`, `PUT/DELETE /announcements/:id` |
| Calendar | `GET/POST /calendar`, `DELETE /calendar/:id` |
| Notifications | `GET /notifications`, `/unread-count`, `PATCH /:id/read`, `/read-all` |
| Dashboard | `GET /dashboard` |
| Files | `GET /files/:id` (`?inline=1` to preview) |

The backend README lists every route with its method and allowed roles.

---

## 9. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| Backend exits with "Missing required environment variables" | `.env` is missing or incomplete. Copy `.env.example` and fill `DB_HOST`, `DB_USER`, `DB_NAME`, `JWT_SECRET`. |
| "Database connection failed" | MySQL not running, wrong user or password, or the user lacks rights on `smart_campus`. Re-run the `GRANT` from step 1. |
| Browser console shows a CORS error | `CLIENT_URL` in the backend `.env` must equal the address in the browser (`http://localhost:5173`). Restart the backend after changing it. |
| Login says "Invalid email or password" for the admin | The placeholder hash is still in place. Do step 2. |
| Logged out immediately after login | Token expired or `JWT_SECRET` changed. Log in again. |
| "Unknown column" or "Table doesn't exist" | The script did not finish. Run `smart_campus_schema.sql` again completely. |
| Procedure error with DELIMITER | Run the script inside MySQL Workbench's SQL editor, not another client. |
| No deadline reminders arrive | Event scheduler is off. Run `SET GLOBAL event_scheduler = ON;`. |
| "Section does not belong to the selected program" | When adding a student, choose the program first, then a section of that program. |
| "Subject and section must belong to the same program and semester" | Pick a subject whose semester matches the section's semester. |
| "Semester 3 sections need a specialization" | In Academic Setup -> Sections, choose the specialization for Sem 3 and Sem 4 sections. |
| "Specializations start only from semester 3" | Sem 1 and 2 sections must be created without a specialization. |
| "This subject belongs to a different specialization than the selected section" | A Data Science subject can be assigned only to a Data Science section. Use a common subject, or create the subject under the right specialization. |
| Migration fails with "Duplicate column name" | The migration was already run. Do not run it twice. |
| Lecturer sees no classes | The admin has not created teaching assignments for that lecturer. |
| Student sees no assignments or materials | Student's section has no teaching assignments, or nothing has been published yet. |
| Upload rejected | Wrong file type or too large. Limits: time table 10 MB (pdf, png, jpg), material 25 MB (pdf, ppt, pptx, doc, docx), assignment attachment 15 MB, submission 15 MB (pdf), attendance proof 5 MB. |
| Port already in use | Change `PORT` in the backend `.env` (and `VITE_API_URL` in the frontend) or stop the other program. |

---

## 10. Known limitations

- **Forgot password:** no email service is connected yet; the reset link is printed in the backend console. Connect an email sender (for example nodemailer) before real use.
- **Deactivated users** stay logged in until their token expires (`JWT_EXPIRES_IN`).
- **Scheduled announcements:** an announcement with a future publish time is stored, but its notifications are sent only when it is published immediately.
- **Optional form fields** cannot be cleared back to empty on edit (empty values are not sent).
- **Time table** is an uploaded file per section, not a period-by-period grid.
- **Electives:** every student of a section gets the same subjects (specialization subjects are handled through the specialization sections).
- There is no screen to create extra admin accounts; add them directly in the database.

---

## 11. Before using it for real

- Change `JWT_SECRET` to a long random value and keep `.env` out of version control (`.gitignore` already excludes it).
- Use the limited database user, never root.
- Serve the site over HTTPS and set `NODE_ENV=production` for the backend.
- Back up both the `smart_campus` database and the `uploads/` folder.
- Run `npm run build` in the frontend and serve the `dist/` folder with a web server.

---

## 12. Quick test checklist

1. Admin: log in, create department, program, academic year, section, subjects, one lecturer, one student, one teaching assignment.
2. Lecturer: log in with the temporary password (change it), mark attendance with the student absent.
3. Student: log in, see the absent day, raise an issue.
4. Lecturer: approve the issue; the student's percentage updates.
5. Lecturer: create an assignment with a deadline 2 hours from now and publish it.
6. Student: see the alert, submit by link; the lecturer grades it.
7. Lecturer: upload a PDF as study material; the student downloads it.
8. Admin: upload a time table; the student and lecturer see it and get a notification.
9. Lecturer: post an announcement with an extra class on the calendar; the student sees it on the calendar.
