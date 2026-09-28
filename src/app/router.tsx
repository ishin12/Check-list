import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { TemplateListScreen } from '@/screens/TemplateList/TemplateListScreen';
import { JobRunnerScreen } from '@/screens/JobRunner/JobRunnerScreen';
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
import { NotificationsScreen } from '@/screens/Notifications/NotificationsScreen';
import { PortalScreen } from '@/screens/Portal/PortalScreen';
import { RoleGate } from '@/components/RoleGate';
import { RootRedirect } from '@/screens/Home/RootRedirect';
import { SignScreen } from '@/screens/Sign/SignScreen';
import { FieldHomeScreen } from '@/screens/field/FieldHomeScreen';
import { StartVisitScreen } from '@/screens/field/StartVisitScreen';
import { VisitScreen } from '@/screens/field/VisitScreen';
import { ProjectsScreen } from '@/screens/field/ProjectsScreen';
import { ProjectDetailScreen } from '@/screens/field/ProjectDetailScreen';
import type { Role } from '@/domain/models/ops';

// Heavier screens (PDF, Excel, admin) load on first use to keep the phone start fast.
const ReportPreviewScreen = lazy(() => import('@/screens/ReportPreview/ReportPreviewScreen').then((m) => ({ default: m.ReportPreviewScreen })));
const VisitReportScreen = lazy(() => import('@/screens/field/VisitReportScreen').then((m) => ({ default: m.VisitReportScreen })));
const ReportsScreen = lazy(() => import('@/screens/field/ReportsScreen').then((m) => ({ default: m.ReportsScreen })));
const LaborScreen = lazy(() => import('@/screens/field/LaborScreen').then((m) => ({ default: m.LaborScreen })));
const MonthCloseScreen = lazy(() => import('@/screens/field/MonthCloseScreen').then((m) => ({ default: m.MonthCloseScreen })));
const ConfigScreen = lazy(() => import('@/screens/field/ConfigScreen').then((m) => ({ default: m.ConfigScreen })));
const EmployeesScreen = lazy(() => import('@/screens/field/EmployeesScreen').then((m) => ({ default: m.EmployeesScreen })));
const ProjectEditScreen = lazy(() => import('@/screens/field/ProjectEditScreen').then((m) => ({ default: m.ProjectEditScreen })));
const AuditScreen = lazy(() => import('@/screens/Audit/AuditScreen').then((m) => ({ default: m.AuditScreen })));
const UsersScreen = lazy(() => import('@/screens/Users/UsersScreen').then((m) => ({ default: m.UsersScreen })));
const TemplateEditorScreen = lazy(() => import('@/screens/TemplateEditor/TemplateEditorScreen').then((m) => ({ default: m.TemplateEditorScreen })));
const SignatureCaptureScreen = lazy(() => import('@/screens/SignatureCapture/SignatureCaptureScreen').then((m) => ({ default: m.SignatureCaptureScreen })));

function L({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="app-shell"><main className="app-main"><p className="hint">…</p></main></div>}>{children}</Suspense>;
}

const FIELD: Role[] = ['supervisor', 'worker', 'manager'];
const LEGACY: Role[] = ['worker', 'supervisor', 'manager'];

// BASE_URL is '/Check-list/' in production builds, '/' in dev. Browser router
// needs the basename without the trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

// Standalone demo builds (VITE_HASH_ROUTER=1) are hosted as plain static files
// where deep links can't be rewritten, so they route via the URL hash.
const hashRouter = import.meta.env.VITE_HASH_ROUTER === '1';

export const router = (hashRouter ? createHashRouter : createBrowserRouter)([
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginScreen /> },
  { path: '/auth/callback', element: <AuthCallbackScreen /> },
  // Public, unauthenticated signing page (reached from the WhatsApp link).
  { path: '/sign/:token', element: <SignScreen /> },

  // Field operations (Master Spec v2.1)
  { path: '/field',              element: <RoleGate roles={FIELD}><FieldHomeScreen /></RoleGate> },
  { path: '/visits/start',       element: <RoleGate roles={FIELD}><StartVisitScreen /></RoleGate> },
  { path: '/visits/:id',         element: <RoleGate roles={FIELD} finance><VisitScreen /></RoleGate> },
  { path: '/visits/:id/report',  element: <RoleGate roles={FIELD} finance><L><VisitReportScreen /></L></RoleGate> },
  { path: '/projects',           element: <RoleGate roles={FIELD} finance><ProjectsScreen /></RoleGate> },
  { path: '/projects/new',       element: <RoleGate roles={['manager']}><L><ProjectEditScreen /></L></RoleGate> },
  { path: '/projects/:id',       element: <RoleGate roles={FIELD} finance><ProjectDetailScreen /></RoleGate> },
  { path: '/projects/:id/edit',  element: <RoleGate roles={['manager']}><L><ProjectEditScreen /></L></RoleGate> },
  { path: '/employees',          element: <RoleGate roles={['manager']}><L><EmployeesScreen /></L></RoleGate> },
  { path: '/config',             element: <RoleGate roles={['manager']}><L><ConfigScreen /></L></RoleGate> },
  { path: '/reports',            element: <RoleGate roles={FIELD} finance><L><ReportsScreen /></L></RoleGate> },
  { path: '/labor',              element: <RoleGate roles={FIELD} finance><L><LaborScreen /></L></RoleGate> },
  { path: '/month-close',        element: <RoleGate roles={['finance', 'manager']} finance><L><MonthCloseScreen /></L></RoleGate> },

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
  { path: '/audit',          element: <RoleGate roles={['manager']} finance><L><AuditScreen /></L></RoleGate> },
  { path: '/users',          element: <RoleGate roles={['manager']}><L><UsersScreen /></L></RoleGate> },

  // Client portal
  { path: '/portal',         element: <RoleGate roles={['client']}><PortalScreen /></RoleGate> },

  // Existing manager-only checklist authoring & legacy flows
  { path: '/home',           element: <RoleGate roles={['manager']}><HomeScreen /></RoleGate> },
  { path: '/templates',      element: <RoleGate roles={['manager']}><TemplateListScreen /></RoleGate> },
  { path: '/templates/new',  element: <RoleGate roles={['manager']}><L><TemplateEditorScreen /></L></RoleGate> },
  { path: '/templates/:id',  element: <RoleGate roles={['manager']}><L><TemplateEditorScreen /></L></RoleGate> },
  { path: '/job',            element: <RoleGate roles={LEGACY}><JobRunnerScreen /></RoleGate> },
  { path: '/signature',      element: <RoleGate roles={LEGACY}><L><SignatureCaptureScreen /></L></RoleGate> },
  { path: '/report',         element: <RoleGate roles={LEGACY}><L><ReportPreviewScreen /></L></RoleGate> },
  { path: '/settings',       element: <RoleGate roles={[...LEGACY, 'finance', 'client']}><SettingsScreen /></RoleGate> },

  { path: '*', element: <Navigate to="/" replace /> },
], { basename: hashRouter ? '/' : basename });
