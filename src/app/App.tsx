import { RouterProvider } from 'react-router-dom';
import { StorageProviderContext } from './providers/StorageContext';
import { LanguageProvider, useLanguage } from './providers/LanguageContext';
import { CurrentJobProvider } from './providers/CurrentJobContext';
import { AuthProvider } from './providers/AuthContext';
import { DirectoryProvider } from './providers/DirectoryContext';
import { FieldDataProvider } from './providers/FieldDataContext';
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
            <FieldDataProvider>
              <CurrentJobProvider>
                <AppRoutes />
              </CurrentJobProvider>
            </FieldDataProvider>
          </DirectoryProvider>
        </AuthProvider>
      </LanguageProvider>
    </StorageProviderContext>
  );
}
