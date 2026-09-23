import { useEffect, useState } from 'react';
import { fetchLeaderboard, type Leaderboard, type LeaderboardEntry } from '../game/leaderboard';
import styles from './LeaderboardPanel.module.css';

interface Props {
  /** Dữ liệu vừa nhận sau khi nộp điểm — có thì hiện ngay, khỏi gọi lại. */
  initial: Leaderboard | null;
  onClose: () => void;
  onRename: () => void;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: Leaderboard };

export default function LeaderboardPanel({ initial, onClose, onRename }: Props) {
  const [state, setState] = useState<State>(() =>
    initial ? { kind: 'ready', data: initial } : { kind: 'loading' },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchLeaderboard()
      .then((data) => alive && setState({ kind: 'ready', data }))
      .catch(() => alive && setState((s) => (s.kind === 'ready' ? s : { kind: 'error' })));
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 id="lb-title" className={styles.title}>
              Bảng xếp hạng
            </h2>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Đóng"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        </div>

        {state.kind === 'loading' && <p className={styles.note}>Đang tải…</p>}
        {state.kind === 'error' && (
          <div className={styles.note}>
            <p>Không tải được bảng xếp hạng.</p>
            <button type="button" className={styles.retry} onClick={retry}>
              Thử lại
            </button>
          </div>
        )}
        {state.kind === 'ready' && <Board data={state.data} />}
        <button type="button" className={styles.rename} onClick={onRename}>
          Đổi tên
        </button>
      </div>
    </div>
  );
}

function Board({ data }: { data: Leaderboard }) {
  if (data.top.length === 0) {
    return <p className={styles.note}>Chưa có ai ghi điểm. Chơi một ván để mở màn!</p>;
  }
  // Mình nằm ngoài top thì ghim thêm một dòng ở cuối.
  const meOutside = data.me && !data.top.some((e) => e.me) ? data.me : null;

  return (
    <>
      <ol className={styles.list}>
        {data.top.map((e) => (
          <Row key={e.rank} entry={e} />
        ))}
      </ol>
      {meOutside && (
        <ol className={`${styles.list} ${styles.mine}`} start={meOutside.rank}>
          <Row entry={meOutside} />
        </ol>
      )}
      <p className={styles.foot}>{data.total} người chơi</p>
    </>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  const medal = entry.rank <= 3 ? styles[`m${entry.rank}`] : '';
  return (
    <li className={`${styles.row} ${entry.me ? styles.me : ''}`}>
      <span className={`${styles.rank} ${medal}`}>{entry.rank}</span>
      <span className={styles.name}>
        {entry.name ?? 'Người chơi'}
        {/* Mã hash giúp phân biệt hai người trùng tên. */}
        <small className={styles.tag}>{entry.me ? 'bạn' : `#${entry.tag}`}</small>
      </span>
      <span className={styles.pts}>{entry.score.toLocaleString('vi-VN')}</span>
    </li>
  );
}
