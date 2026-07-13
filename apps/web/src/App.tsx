import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { router } from './routes/router';

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
