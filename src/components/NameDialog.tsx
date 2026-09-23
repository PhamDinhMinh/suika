import { useState, type FormEvent } from 'react';
import { MAX_NAME } from '../game/leaderboard';
import styles from './LeaderboardPanel.module.css';

interface Props {
  initialName: string;
  onSubmit: (name: string) => void;
  /** Không truyền = bắt buộc nhập (lần đầu vào game), không có nút đóng. */
  onClose?: () => void;
}

export default function NameDialog({ initialName, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const clean = name.replace(/\s+/g, ' ').trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (clean) onSubmit(clean);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <form
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Chặn Escape lan lên window, kẻo đóng luôn bảng xếp hạng nằm dưới.
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onClose?.();
        }}
        onSubmit={submit}
      >
        <div className={styles.head}>
          <div>
            <h2 id="name-title" className={styles.title}>
              {onClose ? 'Đổi tên' : 'Bạn tên gì?'}
            </h2>
          </div>
          {onClose && (
            <button type="button" className={styles.close} aria-label="Đóng" onClick={onClose}>
              ×
            </button>
          )}
        </div>

        <p className={styles.lead}>Tên này sẽ hiện trên bảng xếp hạng.</p>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          placeholder="Nhập tên của bạn"
          aria-label="Tên người chơi"
          autoComplete="nickname"
          enterKeyHint="done"
          autoFocus
        />
        <button type="submit" className={styles.submit} disabled={!clean}>
          {onClose ? 'Lưu' : 'Vào chơi'}
        </button>
      </form>
    </div>
  );
}
