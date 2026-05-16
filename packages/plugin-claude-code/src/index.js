import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PLUGIN_DIST_DIR = path.resolve(here, '..', 'dist');
