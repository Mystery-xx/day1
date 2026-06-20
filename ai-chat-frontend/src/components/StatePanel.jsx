import React from 'react';
import './StatePanel.css';

const STATES = [
  { key: 'PLANNING', label: 'Planning', icon: '🟡', color: '#f59e0b' },
  { key: 'EXECUTION', label: 'Execution', icon: '🔵', color: '#3b82f6' },
  { key: 'VALIDATION', label: 'Validation', icon: '🟠', color: '#f97316' },
  { key: 'DONE', label: 'Done', icon: '🟢', color: '#10b981' }
];

function StatePanel({ currentState, onStateChange }) {
  const currentIndex = STATES.findIndex(s => s.key === currentState);

  return (
    <div className="state-panel">
      <div className="state-panel-container">
        {STATES.map((state, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;
          const isFuture = index > currentIndex;

          return (
            <React.Fragment key={state.key}>
              <div
                className={`state-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isFuture ? 'future' : ''}`}
                style={{
                  '--state-color': state.color,
                  '--state-opacity': isActive ? 1 : isCompleted ? 0.6 : 0.3
                }}
              >
                <div className="state-icon">{state.icon}</div>
                <div className="state-label">{state.label}</div>
                {isActive && <div className="state-indicator" />}
              </div>
              
              {index < STATES.length - 1 && (
                <div className={`state-arrow ${index < currentIndex ? 'completed' : ''}`}>
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default StatePanel;
