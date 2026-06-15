/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth web client ID used by Google Identity Services (GIS). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
