/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gốc của API bảng xếp hạng. Bỏ trống khi app và API cùng domain. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
