import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/pt-serif/700.css';
import './ui/style.css';
import { content } from './content';
import { mountApp } from './ui/app';

mountApp(document.getElementById('app')!, content);
