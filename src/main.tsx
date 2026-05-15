import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
  person_profiles: 'identified_only',
});

function Root() {
  if (!PUBLISHABLE_KEY) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Required</h1>
        <p className="text-gray-600 mb-6 max-w-md">
          Clerk Publishable Key is missing. Please add <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> to your environment variables in the Settings menu.
        </p>
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200 w-full max-w-lg overflow-auto">
          <code className="text-xs text-left block">
            VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
          </code>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
