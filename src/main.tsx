import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';

posthog.init((import.meta as any).env.VITE_PUBLIC_POSTHOG_TOKEN, {
  api_host: (import.meta as any).env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
  person_profiles: 'identified_only',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </StrictMode>,
);
