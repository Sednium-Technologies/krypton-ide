/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Allow importing raw text files with ?raw suffix
declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// Allow any ?raw import
declare module '*?raw' {
  const content: string;
  export default content;
}

declare module 'html-to-image/dist/html-to-image.js?raw' {
  const content: string;
  export default content;
}
