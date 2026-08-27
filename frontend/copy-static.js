import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcJs = path.join(__dirname, 'js');
const destJs = path.join(__dirname, 'dist', 'js');
const srcStyles = path.join(__dirname, 'styles');
const destStyles = path.join(__dirname, 'dist', 'styles');

try {
  if (fs.existsSync(srcJs)) {
    fs.cpSync(srcJs, destJs, { recursive: true });
    console.log('✓ Copied js/ to dist/js/');
  }
  if (fs.existsSync(srcStyles)) {
    fs.cpSync(srcStyles, destStyles, { recursive: true });
    console.log('✓ Copied styles/ to dist/styles/');
  }
} catch (err) {
  console.error('Error copying static assets:', err);
}
