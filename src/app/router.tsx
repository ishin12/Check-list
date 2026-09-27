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
import { FieldHomeScreen } from '@/screens/field/FieldHomeScreen';
import { StartVisitScreen } from '@/screens/field/StartVisitScreen';
import { VisitScreen } from '@/screens/field/VisitScreen';
import { VisitReportScreen } from '@/screens/field/VisitReportScreen';
import { ProjectsScreen } from '@/screens/field/ProjectsScreen';
import { ProjectEditScreen } from '@/screens/field/ProjectEditScreen';
import { ProjectDetailScreen } from '@/screens/field/ProjectDetailScreen';
import { EmployeesScreen } from '@/screens/field/EmployeesScreen';
import { ConfigScreen } from '@/screens/field/ConfigScreen';
import { ReportsScreen } from '@/screens/field/ReportsScreen';
import { LaborScreen } from '@/screens/field/LaborScreen';
import { MonthCloseScreen } from '@/screens/field/MonthCloseScreen';
import type { Role } from '@/domain/models/ops';

const FIELD: Role[] = ['supervisor', 'worker', 'manager'];
const LEGACY: Role[] = ['worker', 'supervisor', 'manager'];

// BASE_URL is '/Check-list/' in production builds, '/' in dev. Browser router
// needs the basename without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginScreen /> },
  { path: '/auth/callback', element: <AuthCallbackScreen /> },
  // Public, unauthenticated signing page (reached from the WhatsApp link).
  { path: '/sign/:token', element: <SignScreen /> },

  // Field operations (Master Spec v2.1)
  { path: '/field',              element: <RoleGate roles={FIELD}><FieldHomeScreen /></RoleGate> },
  { path: '/visits/start',       element: <RoleGate roles={FIELD}><StartVisitScreen /></RoleGate> },
  { path: '/visits/:id',         element: <RoleGate roles={FIELD} finance><VisitScreen /></RoleGate> },
  { path: '/visits/:id/report',  element: <RoleGate roles={FIELD} finance><VisitReportScreen /></RoleGate> },
  { path: '/projects',           element: <RoleGate roles={FIELD} finance><ProjectsScreen /></RoleGate> },
  { path: '/projects/new',       element: <RoleGate roles={['manager']}><ProjectEditScreen /></RoleGate> },
  { path: '/projects/:id',       element: <RoleGate roles={FIELD} finance><ProjectDetailScreen /></RoleGate> },
  { path: '/projects/:id/edit',  element: <RoleGate roles={['manager']}><ProjectEditScreen /></RoleGate> },
  { path: '/employees',          element: <RoleGate roles={['manager']}><EmployeesScreen /></RoleGate> },
  { path: '/config',             element: <RoleGate roles={['manager']}><ConfigScreen /></RoleGate> },
  { path: '/reports',            element: <RoleGate roles={FIELD} finance><ReportsScreen /></RoleGate> },
  { path: '/labor',              element: <RoleGate roles={FIELD} finance><LaborScreen /></RoleGate> },
  { path: '/month-close',        element: <RoleGate roles={['finance', 'manager']} finance><MonthCloseScreen /></RoleGate> },

  // Worker + manager surfaces (older task system)
  { path: '/today',          element: <RoleGate roles={LEGACY}><TodayScreen /></RoleGate> },
  { path: '/calendar',       element: <RoleGate roles={LEGACY}><CalendarScreen /></RoleGate> },
  { path: '/tasks/new',      element: <RoleGate roles={['manager']}><TaskNewScreen /></RoleGate> },
  { path: '/tasks/:id',      element: <RoleGate roles={LEGACY}><TaskDetailScreen /></RoleGate> },
  { path: '/tasks/:id/capture/:kind', element: <RoleGate roles={LEGACY}><MediaCaptureScreen /></RoleGate> },
  { path: '/notifications',  element: <RoleGate roles={LEGACY}><NotificationsScreen /></RoleGate> },

  // Manager-only
  { path: '/clients',        element: <RoleGate roles={['manager']}><ClientsScreen /></RoleGate> },
  { path: '/clients/new',    element: <RoleGate roles={['manager']}><ClientNewScreen /></RoleGate> },
  { path: '/clients/:id',    element: <RoleGate roles={['manager']}><ClientDetailScreen /></RoleGate> },
  { path: '/approvals',      element: <RoleGate roles={['manager']}><ApprovalsScreen /></RoleGate> },
  { path: '/audit',          element: <RoleGate roles={['manager']} finance><AuditScreen /></RoleGate> },
  { path: '/users',          element: <RoleGate roles={['manager']}><UsersScreen /></RoleGate> },

  // Client portal
  { path: '/portal',         element: <RoleGate roles={['client']}><PortalScreen /></RoleGate> },

  // Existing manager-only checklist authoring & legacy flows
  { path: '/home',           element: <RoleGate roles={['manager']}><HomeScreen /></RoleGate> },
  { path: '/templates',      element: <RoleGate roles={['manager']}><TemplateListScreen /></RoleGate> },
  { path: '/templates/new',  element: <RoleGate roles={['manager']}><TemplateEditorScreen /></RoleGate> },
  { path: '/templates/:id',  element: <RoleGate roles={['manager']}><TemplateEditorScreen /></RoleGate> },
  { path: '/job',            element: <RoleGate roles={LEGACY}><JobRunnerScreen /></RoleGate> },
  { path: '/signature',      element: <RoleGate roles={LEGACY}><SignatureCaptureScreen /></RoleGate> },
  { path: '/report',         element: <RoleGate roles={LEGACY}><ReportPreviewScreen /></RoleGate> },
  { path: '/settings',       element: <RoleGate roles={[...LEGACY, 'finance', 'client']}><SettingsScreen /></RoleGate> },

  { path: '*', element: <Navigate to="/" replace /> },
], { basename });
