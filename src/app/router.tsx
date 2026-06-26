import { createBrowserRouter, Navigate } from 'react-router-dom';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { TemplateListScreen } from '@/screens/TemplateList/TemplateListScreen';
import { TemplateEditorScreen } from '@/screens/TemplateEditor/TemplateEditorScreen';
import { JobRunnerScreen } from '@/screens/JobRunner/JobRunnerScreen';
import { SignatureCaptureScreen } from '@/screens/SignatureCapture/SignatureCaptureScreen';
import { ReportPreviewScreen } from '@/screens/ReportPreview/ReportPreviewScreen';
import { SettingsScreen } from '@/screens/Settings/SettingsScreen';
import { LoginScreen } from '@/screens/Login/LoginScreen';
import { AuthCallbackScreen } from '@/screens/Login/AuthCallbackScreen';
import { TodayScreen } from '@/screens/Today/TodayScreen';
import { CalendarScreen } from '@/screens/Calendar/CalendarScreen';
import { TaskDetailScreen } from '@/screens/TaskDetail/TaskDetailScreen';
import { TaskNewScreen } from '@/screens/TaskNew/TaskNewScreen';
import { MediaCaptureScreen } from '@/screens/MediaCapture/MediaCaptureScreen';
import { ClientsScreen } from '@/screens/Clients/ClientsScreen';
import { ClientDetailScreen } from '@/screens/Clients/ClientDetailScreen';
import { ClientNewScreen } from '@/screens/Clients/ClientNewScreen';
import { ApprovalsScreen } from '@/screens/Approvals/ApprovalsScreen';
import { AuditScreen } from '@/screens/Audit/AuditScreen';
import { UsersScreen } from '@/screens/Users/UsersScreen';
import { NotificationsScreen } from '@/screens/Notifications/NotificationsScreen';
import { PortalScreen } from '@/screens/Portal/PortalScreen';
import { RoleGate } from '@/components/RoleGate';
import { RootRedirect } from '@/screens/Home/RootRedirect';
import { SignScreen } from '@/screens/Sign/SignScreen';

// BASE_URL is '/Check-list/' in production builds, '/' in dev. Browser router
// needs the basename without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginScreen /> },
  { path: '/auth/callback', element: <AuthCallbackScreen /> },
  // Public, unauthenticated signing page (reached from the WhatsApp link).
  { path: '/sign/:token', element: <SignScreen /> },

  // Worker + manager surfaces
  { path: '/today',          element: <RoleGate roles={['worker', 'manager']}><TodayScreen /></RoleGate> },
  { path: '/calendar',       element: <RoleGate roles={['worker', 'manager']}><CalendarScreen /></RoleGate> },
  { path: '/tasks/new',      element: <RoleGate roles={['manager']}><TaskNewScreen /></RoleGate> },
  { path: '/tasks/:id',      element: <RoleGate roles={['worker', 'manager']}><TaskDetailScreen /></RoleGate> },
  { path: '/tasks/:id/capture/:kind', element: <RoleGate roles={['worker', 'manager']}><MediaCaptureScreen /></RoleGate> },
  { path: '/notifications',  element: <RoleGate roles={['worker', 'manager']}><NotificationsScreen /></RoleGate> },

  // Manager-only
  { path: '/clients',        element: <RoleGate roles={['manager']}><ClientsScreen /></RoleGate> },
  { path: '/clients/new',    element: <RoleGate roles={['manager']}><ClientNewScreen /></RoleGate> },
  { path: '/clients/:id',    element: <RoleGate roles={['manager']}><ClientDetailScreen /></RoleGate> },
  { path: '/approvals',      element: <RoleGate roles={['manager']}><ApprovalsScreen /></RoleGate> },
  { path: '/audit',          element: <RoleGate roles={['manager']}><AuditScreen /></RoleGate> },
  { path: '/users',          element: <RoleGate roles={['manager']}><UsersScreen /></RoleGate> },

  // Client portal
  { path: '/portal',         element: <RoleGate roles={['client']}><PortalScreen /></RoleGate> },

  // Existing manager-only checklist authoring & legacy flows
  { path: '/home',           element: <RoleGate roles={['manager']}><HomeScreen /></RoleGate> },
  { path: '/templates',      element: <RoleGate roles={['manager']}><TemplateListScreen /></RoleGate> },
  { path: '/templates/new',  element: <RoleGate roles={['manager']}><TemplateEditorScreen /></RoleGate> },
  { path: '/templates/:id',  element: <RoleGate roles={['manager']}><TemplateEditorScreen /></RoleGate> },
  { path: '/job',            element: <RoleGate roles={['worker', 'manager']}><JobRunnerScreen /></RoleGate> },
  { path: '/signature',      element: <RoleGate roles={['worker', 'manager']}><SignatureCaptureScreen /></RoleGate> },
  { path: '/report',         element: <RoleGate roles={['worker', 'manager']}><ReportPreviewScreen /></RoleGate> },
  { path: '/settings',       element: <RoleGate roles={['worker', 'manager', 'client']}><SettingsScreen /></RoleGate> },

  { path: '*', element: <Navigate to="/" replace /> },
], { basename });
