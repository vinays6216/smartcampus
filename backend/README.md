# Smart Campus Backend (Node.js + Express + MySQL)

REST API for the Smart Campus Management System. It matches the `smart_campus` MySQL database created by `smart_campus_schema.sql`.

## 1. Run it

1. Create the database first (run `smart_campus_schema.sql` in MySQL Workbench).
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and fill the values (DB user/password, a long random `JWT_SECRET`).
4. Generate a bcrypt hash for the admin password and put it in the `users` table:
   `node -e "console.log(require('bcryptjs').hashSync('YourAdminPassword', 10))"`
   then in Workbench: `UPDATE users SET password_hash='<hash>' WHERE email='admin@smartcampus.local';`
5. `npm run dev` (auto restart) or `npm start`. Test: open http://localhost:5000/api/health

## 2. Conventions

- Base URL: `/api`. Protected routes need the header `Authorization: Bearer <token>` (token comes from `/api/auth/login`).
- Requests use camelCase JSON; every JSON response is also converted to camelCase.
- Success: `{ "success": true, "data": ... }`. Failure: `{ "success": false, "message": "...", "details": [...] }`.
- Uploads use `multipart/form-data`. Files are saved under `uploads/<category>/` and downloaded only through `GET /api/files/:id`.
- Roles: `student`, `lecturer`, `admin`. Lecturers can only touch their own teaching assignments (subject + section).

## 3. Folder structure

```
smart-campus-backend/
  server.js                      starts the server after checking the DB connection
  package.json  .env.example  .gitignore  README.md
  uploads/                       uploaded files (timetables, materials, assignments, submissions, proofs)
  src/
    app.js                       express app: security, parsers, routes, error handling
    config/
      env.js                     reads and checks .env
      db.js                      MySQL pool + withTransaction()
    middleware/
      auth.js                    authenticate (JWT) + authorize(roles)
      validate.js                zod validation for body / query / params
      upload.js                  multer setups with allowed file types and size limits
      camelCase.js               snake_case -> camelCase for all responses
      errorHandler.js  notFound.js
    utils/
      ApiError.js  asyncHandler.js  paging.js  sql.js  zodHelpers.js
      profile.js                 users.id -> students/lecturers/admins id
      ownership.js               "does this lecturer teach this class?" checks
      files.js                   saves a row in `files`
      fileAccess.js              who may download which file
      notify.js                  writes into `notifications`
      audit.js                   writes into `audit_logs`
    routes/
      index.js                   mounts every module under /api
    modules/                     each module = routes (URLs + validation) + controller (logic + SQL)
      auth/          auth.routes.js         auth.controller.js
      users/         users.routes.js        users.controller.js        (admin: students, lecturers)
      academic/      academic.routes.js     academic.controller.js     (departments, programs, years, sections, subjects)
      teaching/      teaching.routes.js     teaching.controller.js     (lecturer + subject + section)
      timetable/     timetable.routes.js    timetable.controller.js
      attendance/    attendance.routes.js   attendance.controller.js
      assignments/   assignments.routes.js  assignments.controller.js
      materials/     materials.routes.js    materials.controller.js
      announcements/ announcements.routes.js announcements.controller.js
      calendar/      calendar.routes.js     calendar.controller.js
      notifications/ notifications.routes.js notifications.controller.js
      dashboard/     dashboard.routes.js    dashboard.controller.js
      files/         files.routes.js        files.controller.js
```

## 4. All routes

### Auth  `/api/auth`
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /login | public | email + password -> token + user |
| GET | /me | any | logged-in user with profile |
| POST | /change-password | any | currentPassword, newPassword |
| POST | /forgot-password | public | sends reset link (printed in console until email is connected) |
| POST | /reset-password | public | token, newPassword |

### Admin: students & lecturers  `/api/admin`
| Method | Path | Purpose |
|---|---|---|
| GET | /students | list with q, programId, sectionId, status, page, limit |
| GET | /students/:id | full details |
| POST | /students | create login + profile, returns temporaryPassword |
| PUT | /students/:id | edit details |
| PATCH | /students/:id/status | active, suspended, dropped, passed_out |
| GET/GET/POST/PUT/PATCH | /lecturers, /lecturers/:id, /lecturers/:id/status | same for lecturers |
| POST | /users/:userId/reset-password | new temporary password |
| GET | /dashboard/counts | admin counts |

### Academic set-up  `/api/academic`  (GET: any user, write: admin)
`/departments`, `/programs`, `/academic-years`, `/sections`, `/subjects` each support GET `/`, GET `/:id`, POST `/`, PUT `/:id`, DELETE `/:id`.

### Teaching assignments  `/api/teaching`
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | / | admin, lecturer | admin: all (filters), lecturer: own classes |
| POST | / | admin | lecturerId, subjectId, sectionId |
| DELETE | /:id | admin | remove |
| GET | /:id/roster | lecturer, admin | students of the class (?date=&period= tells if already marked) |

### Timetable  `/api/timetables`
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | / | all | student: own section, lecturer: his sections, admin: filters |
| POST | / | admin | upload (file, sectionId, title, effectiveFrom, effectiveTo) |
| PATCH | /:id/deactivate | admin | hide a timetable |

### Attendance  `/api/attendance`
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | /student/summary | student | subject-wise % and overall % |
| GET | /student/detail | student | day-by-day list (from, to, subjectCode, status) |
| POST | /issues | student | raise issue (attendanceRecordId, reason, optional file `proof`) |
| GET | /issues/mine | student | my issues |
| PATCH | /issues/:id/withdraw | student | withdraw open issue |
| POST | /sessions | lecturer | mark attendance (teachingAssignmentId, sessionDate, periodNo, records of absentees/late) |
| GET | /sessions | lecturer, admin | sessions of a class (teachingAssignmentId, from, to) |
| GET | /sessions/:id | lecturer, admin | one session with every student's status |
| PUT | /sessions/:id/records | lecturer | correct marks (history is logged by the DB trigger) |
| GET | /report | lecturer, admin | % between dates: teachingAssignmentId, from, to, optional below |
| GET | /issues | lecturer, admin | issues of my classes (status filter) |
| PATCH | /issues/:id/resolve | lecturer, admin | decision approve / reject, remarks |

### Assignments  `/api/assignments`
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | /manage | lecturer, admin | list with submitted counts |
| POST | /manage | lecturer | create draft (multipart, optional files[]) |
| GET | /manage/:id | lecturer, admin | details + attachments |
| PUT | /manage/:id | lecturer, admin | edit (deadline change notifies students) |
| POST | /manage/:id/publish | lecturer | publish -> not-submitted rows + notifications |
| POST | /manage/:id/close | lecturer, admin | close |
| DELETE | /manage/:id | lecturer, admin | delete a draft |
| GET | /manage/:id/submissions | lecturer, admin | submitted / not submitted list |
| PATCH | /manage/submissions/:submissionId/grade | lecturer, admin | marks, feedback |
| GET | /student | student | my assignments with status tag |
| GET | /student/alerts | student | due soon + overdue |
| GET | /student/:id | student | details + my submission |
| POST | /student/:id/submit-manual | student | "submitted in person" button |
| POST | /student/:id/submit-url | student | online link |
| POST | /student/:id/submit-file | student | PDF upload (field `file`) |
| POST | /student/:id/unsubmit | student | back to "not submitted" |

### Study materials  `/api/materials`
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | / | all | student: own section, lecturer: own, admin: all (filters) |
| POST | / | lecturer | upload pdf / ppt / pptx / doc / docx |
| PUT | /:id | lecturer, admin | edit title, unit, isActive |
| DELETE | /:id | lecturer, admin | hide from students |

### Announcements & calendar
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | /api/announcements | all | feed for my role / section / department |
| POST | /api/announcements | lecturer, admin | announcement, optional `event` object adds it to the calendar |
| PUT, DELETE | /api/announcements/:id | author, admin | edit / delete |
| GET | /api/calendar | all | events (from, to) |
| POST | /api/calendar | lecturer, admin | stand-alone event |
| DELETE | /api/calendar/:id | creator, admin | delete |

### Notifications, dashboard, files
| Method | Path | Purpose |
|---|---|---|
| GET | /api/notifications | list (?unread=true) |
| GET | /api/notifications/unread-count | bell badge |
| PATCH | /api/notifications/:id/read, /api/notifications/read-all | mark read |
| GET | /api/dashboard | role-wise summary cards |
| GET | /api/files/:id | download file (add `?inline=1` to view in browser) |

## 5. Notes

- Passwords are bcrypt hashes. Admin creates accounts; there is no public sign-up.
- A deactivated user stays logged in until the token expires (`JWT_EXPIRES_IN`).
- The hourly deadline reminder runs inside MySQL (event `ev_deadline_reminders`), so the event scheduler must be ON.
- Scheduled announcements (future `publishAt`) are stored but notifications are sent only when published immediately.
