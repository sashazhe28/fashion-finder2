<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/95bfc27b-8504-4795-840e-9f9fbb4c9f8c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the keys (`GEMINI_API_KEY`, Clerk, PostHog, YooKassa)
3. Run the app (Express server with Vite middleware, http://localhost:3000):
   `npm run dev`

The Gemini key is used only by the server (`server/`), it is not included in the frontend build.

Production deploy, payments and architecture: see [deploy/DEPLOY.md](deploy/DEPLOY.md).
