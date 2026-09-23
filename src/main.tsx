import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

/**
 * Zalo Mini App không upload index.html — container tự dựng trang rồi chèn các
 * script khai báo trong app-config.json. Nghĩa là <div id="root"> trong
 * index.html chỉ tồn tại lúc chạy `vite dev`, còn trên app thật thì không có,
 * và bundle có thể chạy trước khi <body> được parse xong. Vì vậy phải tự tạo
 * container và chỉ mount khi DOM đã sẵn sàng.
 */
function mount() {
  let root = document.getElementById('root');

  if (!root) {
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
