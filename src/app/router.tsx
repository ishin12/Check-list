import { createHashRouter } from 'react-router-dom';
import { HomeScreen } from '@/screens/Home/HomeScreen';
import { TemplateListScreen } from '@/screens/TemplateList/TemplateListScreen';
import { TemplateEditorScreen } from '@/screens/TemplateEditor/TemplateEditorScreen';
import { JobRunnerScreen } from '@/screens/JobRunner/JobRunnerScreen';
import { SignatureCaptureScreen } from '@/screens/SignatureCapture/SignatureCaptureScreen';
import { ReportPreviewScreen } from '@/screens/ReportPreview/ReportPreviewScreen';
import { SettingsScreen } from '@/screens/Settings/SettingsScreen';

export const router = createHashRouter([
  { path: '/', element: <HomeScreen /> },
  { path: '/templates', element: <TemplateListScreen /> },
  { path: '/templates/new', element: <TemplateEditorScreen /> },
  { path: '/templates/:id', element: <TemplateEditorScreen /> },
  { path: '/job', element: <JobRunnerScreen /> },
  { path: '/signature', element: <SignatureCaptureScreen /> },
  { path: '/report', element: <ReportPreviewScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
]);
