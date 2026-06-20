import { RouterProvider } from 'react-router-dom';
import { StorageProviderContext } from './providers/StorageContext';
import { LanguageProvider, useLanguage } from './providers/LanguageContext';
import { CurrentJobProvider } from './providers/CurrentJobContext';
import { AuthProvider } from './providers/AuthContext';
import { DirectoryProvider } from './providers/DirectoryContext';
import { router } from './router';

function AppRoutes() {
  const { ready } = useLanguage();
  if (!ready) return null;
  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <StorageProviderContext>
      <LanguageProvider>
        <AuthProvider>
          <DirectoryProvider>
            <CurrentJobProvider>
              <AppRoutes />
            </CurrentJobProvider>
          </DirectoryProvider>
        </AuthProvider>
      </LanguageProvider>
    </StorageProviderContext>
  );
}
