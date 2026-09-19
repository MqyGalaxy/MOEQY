import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './studio-store.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
console.log(JSON.stringify(createStore(root).migrateLegacyRelations(),null,2));
