import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import uiScale from './postcss-ui-scale.js';

export default {
  plugins: [tailwindcss(), uiScale(), autoprefixer()],
};
