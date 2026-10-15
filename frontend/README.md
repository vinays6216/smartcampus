# Smart Campus Frontend (React + Vite)

Web interface for the Smart Campus backend (`smart-campus-backend`). Every page calls the exact routes of that API and uses the same field names (the backend returns camelCase JSON).

## Run it

1. Start the backend first (`npm run dev` in `smart-campus-backend`, port 5000).
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` (change `VITE_API_URL` only if your backend is not on `http://localhost:5000/api`)
4. `npm run dev` and open http://localhost:5173
   (the backend `.env` must have `CLIENT_URL=http://localhost:5173`, otherwise the browser blocks the requests with a CORS error)
5. Log in with the admin account, then create things in this order: Academic Setup (department, program, academic year, section, subjects) -> Lecturers -> Students -> Teaching Assignments. After that lecturers can mark attendance, post assignments and upload materials.

Production build: `npm run build` (output in `dist/`).

## Folder structure

```
smart-campus-frontend/
  index.html  vite.config.js  package.json  .env.example
  src/
    main.jsx                 app start (Router, Toast, Auth providers)
    App.jsx                  all page routes with role protection
    index.css                all styles
    api/
      client.js              axios (adds the token, handles 401) + get/post/put/patch/del helpers
      files.js               secure file download / preview (token + blob)
    context/
      AuthContext.jsx        login, logout, current user
      ToastContext.jsx       success / error messages
    hooks/useFetch.js        loading + error + reload for every page
    utils/
      helpers.js             clean(), toFormData(), errMsg(), status colours, CSV export
      format.js              date, time, size, "time left" formatting
    components/
      ProtectedRoute.jsx     login + role guard (also forces first-login password change)
      Layout.jsx             sidebar per role, alert bell, logout
      FormModal.jsx          one reusable form used by every create / edit screen
      Modal.jsx  FileButton.jsx  ui.jsx (Badge, Tabs, StatCard, Pagination, Async ...)
    pages/
      auth/        Login  ForgotPassword  ResetPassword  ChangePassword
      Dashboard.jsx  Announcements.jsx  CalendarPage.jsx  Timetable.jsx  Materials.jsx  Notifications.jsx
      student/     Attendance  Assignments  AssignmentDetail
      lecturer/    MarkAttendance  AttendanceReport  AttendanceIssues  ManageAssignments  Submissions
      admin/       Students  Lecturers  Academic  Teaching
```

## Page -> backend route map

| Page (URL) | Who | Backend routes used |
|---|---|---|
| /login, /forgot-password, /reset-password, /change-password | all | `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password` |
| / (Dashboard) | all | `/dashboard`, `/assignments/student/alerts`, `/announcements` |
| /attendance | student | `/attendance/student/summary`, `/attendance/student/detail`, `POST /attendance/issues`, `/attendance/issues/mine`, `/attendance/issues/:id/withdraw` |
| /assignments, /assignments/:id | student | `/assignments/student`, `/student/alerts`, `/student/:id`, `/submit-manual`, `/submit-url`, `/submit-file`, `/unsubmit` |
| /mark-attendance | lecturer | `/teaching`, `/teaching/:id/roster`, `/attendance/sessions` (GET, POST), `/attendance/sessions/:id`, `PUT /attendance/sessions/:id/records` |
| /attendance-report | lecturer, admin | `/attendance/report` (from, to, below) |
| /attendance-issues | lecturer, admin | `/attendance/issues`, `/attendance/issues/:id/resolve` |
| /manage-assignments, /manage-assignments/:id/submissions | lecturer, admin | `/assignments/manage` (list, create, update, publish, close, delete), `/manage/:id/submissions`, `/manage/submissions/:id/grade` |
| /timetable | all (admin uploads) | `/timetables`, `POST /timetables`, `/timetables/:id/deactivate` |
| /materials | all (lecturer uploads) | `/materials` (GET, POST, PUT, DELETE), `/files/:id` |
| /announcements | all (staff post) | `/announcements` (GET, POST, DELETE) |
| /calendar | all (staff add) | `/calendar` (GET, POST, DELETE) |
| /notifications | all | `/notifications`, `/notifications/unread-count`, `/notifications/:id/read`, `/notifications/read-all` |
| /students, /lecturers | admin | `/admin/students`, `/admin/lecturers`, `/admin/users/:userId/reset-password` |
| /academic | admin | `/academic/departments`, `programs`, `academic-years`, `sections`, `subjects` |
| /teaching | admin | `/teaching` (GET, POST, DELETE) |

## Notes

- The login token and user are kept in `localStorage`. An expired or invalid token sends the user back to the login page.
- Files are never linked directly. The View / Download buttons fetch `/files/:id` with the token, so the backend checks access every time.
- A user whose password was set by the admin is sent to the change-password page until it is changed.
- Optional form fields that are left empty are not sent (the backend validation rejects empty strings for dates, numbers and ids). For the same reason, an optional field cannot be cleared back to empty on edit.
