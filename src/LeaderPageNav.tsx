import './LeaderPageNav.css';

export type LeaderPage = 'interview' | 'department';

interface LeaderPageNavProps {
  activePage: LeaderPage;
  onNavigate: (page: LeaderPage) => void;
}

export default function LeaderPageNav({ activePage, onNavigate }: LeaderPageNavProps) {
  return (
    <nav className="leader-page-nav" aria-label="페이지 선택">
      <button
        type="button"
        className={`leader-page-nav-btn${activePage === 'interview' ? ' active' : ''}`}
        onClick={() => onNavigate('interview')}
      >
        면담 관리
      </button>
      <button
        type="button"
        className={`leader-page-nav-btn${activePage === 'department' ? ' active' : ''}`}
        onClick={() => onNavigate('department')}
      >
        부서 관리
      </button>
    </nav>
  );
}
