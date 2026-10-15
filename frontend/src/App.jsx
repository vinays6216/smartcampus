import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import ChangePassword from './pages/auth/ChangePassword';

import Dashboard from './pages/Dashboard';
import Announcements from './pages/Announcements';
import CalendarPage from './pages/CalendarPage';
import Timetable from './pages/Timetable';
import Materials from './pages/Materials';
import Notifications from './pages/Notifications';

import StudentAttendance from './pages/student/Attendance';
import StudentAssignments from './pages/student/Assignments';
import AssignmentDetail from './pages/student/AssignmentDetail';

import MarkAttendance from './pages/lecturer/MarkAttendance';
import AttendanceReport from './pages/lecturer/AttendanceReport';
import AttendanceIssues from './pages/lecturer/AttendanceIssues';
import ManageAssignments from './pages/lecturer/ManageAssignments';
import Submissions from './pages/lecturer/Submissions';

import Students from './pages/admin/Students';
import Lecturers from './pages/admin/Lecturers';
import Academic from './pages/admin/Academic';
import Teaching from './pages/admin/Teaching';

export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* any logged-in user */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/notifications" element={<Notifications />} />

          {/* student only */}
          <Route element={<ProtectedRoute roles={['student']} />}>
            <Route path="/attendance" element={<StudentAttendance />} />
            <Route path="/assignments" element={<StudentAssignments />} />
            <Route path="/assignments/:id" element={<AssignmentDetail />} />
          </Route>

          {/* lecturer only */}
          <Route element={<ProtectedRoute roles={['lecturer']} />}>
            <Route path="/mark-attendance" element={<MarkAttendance />} />
          </Route>

          {/* lecturer + admin */}
          <Route element={<ProtectedRoute roles={['lecturer', 'admin']} />}>
            <Route path="/attendance-report" element={<AttendanceReport />} />
            <Route path="/attendance-issues" element={<AttendanceIssues />} />
            <Route path="/manage-assignments" element={<ManageAssignments />} />
            <Route path="/manage-assignments/:id/submissions" element={<Submissions />} />
          </Route>

          {/* admin only */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/students" element={<Students />} />
            <Route path="/lecturers" element={<Lecturers />} />
            <Route path="/academic" element={<Academic />} />
            <Route path="/teaching" element={<Teaching />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
