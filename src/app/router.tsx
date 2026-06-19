import { createHashRouter, Navigate } from 'react-router-dom';
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
import { ApprovalsScreen } from '@/screens/Approvals/ApprovalsScreen';
import { NotificationsScreen } from '@/screens/Notifications/NotificationsScreen';
import { PortalScreen } from '@/screens/Portal/PortalScreen';
import { RoleGate } from '@/components/RoleGate';
import { RootRedirect } from '@/screens/Home/RootRedirect';

export const router = createHashRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginScreen /> },
  { path: '/auth/callback', element: <AuthCallbackScreen /> },

  // Worker + manager surfaces
  { path: '/today',          element: <RoleGate roles={['worker', 'manager']}><TodayScreen /></RoleGate> },
  { path: '/calendar',       element: <RoleGate roles={['worker', 'manager']}><CalendarScreen /></RoleGate> },
  { path: '/tasks/new',      element: <RoleGate roles={['manager']}><TaskNewScreen /></RoleGate> },
  { path: '/tasks/:id',      element: <RoleGate roles={['worker', 'manager']}><TaskDetailScreen /></RoleGate> },
  { path: '/tasks/:id/capture/:kind', element: <RoleGate roles={['worker', 'manager']}><MediaCaptureScreen /></RoleGate> },
  { path: '/notifications',  element: <RoleGate roles={['worker', 'manager']}><NotificationsScreen /></RoleGate> },

  // Manager-only
  { path: '/clients',        element: <RoleGate roles={['manager']}><ClientsScreen /></RoleGate> },
  { path: '/clients/:id',    element: <RoleGate roles={['manager']}><ClientDetailScreen /></RoleGate> },
  { path: '/approvals',      element: <RoleGate roles={['manager']}><ApprovalsScreen /></RoleGate> },

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
]);
