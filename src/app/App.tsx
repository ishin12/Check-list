import { RouterProvider } from 'react-router-dom';
import { StorageProviderContext } from './providers/StorageContext';
import { LanguageProvider, useLanguage } from './providers/LanguageContext';
import { CurrentJobProvider } from './providers/CurrentJobContext';
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
        <CurrentJobProvider>
          <AppRoutes />
        </CurrentJobProvider>
      </LanguageProvider>
    </StorageProviderContext>
  );
}
