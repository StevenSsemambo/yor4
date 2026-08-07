import { useState } from 'react';
import { CATEGORIES, CATEGORY_ORDER } from '../categories';
import { YoRemindMark, BrandFooter } from '../brand/Logo';
import '../brand/brand.css';
import './Sidebar.css';

/** Desktop-only left rail. Below the mobile breakpoint this is hidden
 *  entirely in CSS and BottomNav takes over — see App.jsx / App.css. */
export default function Sidebar({ active, onSelect, counts, onOpenSettings }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav className={`drawers ${collapsed ? 'is-collapsed' : ''}`} aria-label="Reminder categories">
      <div className="drawers__brand">
        <YoRemindMark size={collapsed ? 30 : 38} />
        {!collapsed && (
          <div>
            <div className="drawers__brand-name">YoRemind</div>
            <div className="drawers__brand-tag">the drawer that remembers</div>
          </div>
        )}
        <button
          className="drawers__collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      <button
        className={`drawer drawer--today ${active === 'TODAY' ? 'is-active' : ''}`}
        onClick={() => onSelect('TODAY')}
        title="Today"
      >
        <span className="drawer__tab">★</span>
        {!collapsed && <span className="drawer__label">Today</span>}
        {counts.TODAY > 0 && <span className="drawer__count">{counts.TODAY}</span>}
      </button>

      <button
        className={`drawer ${active === 'ALL' ? 'is-active' : ''}`}
        onClick={() => onSelect('ALL')}
        title="All cards"
      >
        <span className="drawer__tab">≡</span>
        {!collapsed && <span className="drawer__label">All cards</span>}
      </button>

      {!collapsed && <div className="drawers__divider">by category</div>}

      {CATEGORY_ORDER.map((key) => {
        const cat = CATEGORIES[key];
        return (
          <button
            key={key}
            className={`drawer ${active === key ? 'is-active' : ''}`}
            style={{ '--accent': cat.accent }}
            onClick={() => onSelect(key)}
            title={cat.label}
          >
            <span className="drawer__tab">{cat.tab}</span>
            {!collapsed && <span className="drawer__label">{cat.label}</span>}
            {counts[key] > 0 && <span className="drawer__count">{counts[key]}</span>}
          </button>
        );
      })}

      {!collapsed && <div className="drawers__divider">more</div>}

      <button
        className={`drawer ${active === 'CALENDAR' ? 'is-active' : ''}`}
        onClick={() => onSelect('CALENDAR')}
        title="Calendar"
      >
        <span className="drawer__tab">📅</span>
        {!collapsed && <span className="drawer__label">Calendar</span>}
      </button>

      <button
        className={`drawer ${active === 'STATS' ? 'is-active' : ''}`}
        onClick={() => onSelect('STATS')}
        title="Stats"
      >
        <span className="drawer__tab">📊</span>
        {!collapsed && <span className="drawer__label">Stats</span>}
      </button>

      <button className="drawer" onClick={onOpenSettings} title="Settings">
        <span className="drawer__tab">⚙</span>
        {!collapsed && <span className="drawer__label">Settings</span>}
      </button>

      <div className="drawers__spacer" />
      {!collapsed && <BrandFooter />}
    </nav>
  );
}
