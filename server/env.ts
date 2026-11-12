// Must be the first import of the server: loads .env before SDKs read process.env.
// .env.local overrides .env (same convention as Vite). In production systemd passes the variables.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
