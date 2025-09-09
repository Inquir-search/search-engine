// JavaScript wrapper for SharedMemoryWorker.ts
// This allows Node.js worker threads to load TypeScript files

import { register } from 'tsx/esm/api';

// Register tsx for TypeScript support
register();

// Import and run the TypeScript worker
import('./SharedMemoryWorker.ts');