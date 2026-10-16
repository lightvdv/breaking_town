import './ui/style.css';
import { content } from './content';
import { mountApp } from './ui/app';

mountApp(document.getElementById('app')!, content);
