import { useEffect, useMemo } from 'react';
import { HUDDLE_SHORTCUTS, type ShortcutItem } from '../hooks/useShortcuts';
import '../styles/install.css';

export type ShortcutsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  shortcuts?: ShortcutItem[];
};

/**
 * Overlay modal displaying all available keyboard shortcuts with clean kbd keycaps.
 * Features:
 * - Escape key to close
 * - Backdrop click to close
 * - Tactile 3D kbd badges
 * - Categorized layout with helpful hints
 */
export function ShortcutsModal({
  isOpen,
  onClose,
  shortcuts = HUDDLE_SHORTCUTS,
}: ShortcutsModalProps) {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Group shortcuts by category
  const categories = useMemo(() => {
    const map = new Map<string, ShortcutItem[]>();
    for (const item of shortcuts) {
      const cat = item.category || 'General';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries());
  }, [shortcuts]);

  if (!isOpen) return null;

  return (
    <div
      className="shortcuts-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="shortcuts-modal-container glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shortcuts-modal-header">
          <div className="shortcuts-modal-title-group">
            <h2 id="shortcuts-title" className="shortcuts-modal-title">
              Keyboard Shortcuts
            </h2>
            <p className="shortcuts-modal-subtitle">
              Quick keyboard actions for desktop power users
            </p>
          </div>
          <button
            type="button"
            className="shortcuts-modal-close"
            onClick={onClose}
            aria-label="Close shortcuts modal"
          >
            ✕
          </button>
        </header>

        <div className="shortcuts-modal-body">
          {categories.map(([category, items]) => (
            <div key={category} className="shortcuts-modal-section">
              <h3 className="shortcuts-modal-section-title">{category}</h3>
              <div className="shortcuts-modal-list">
                {items.map((item) => (
                  <div key={item.id} className="shortcuts-modal-row">
                    <span className="shortcuts-modal-desc">{item.description}</span>
                    <div className="shortcuts-modal-keys">
                      {item.displayKeys.map((k, idx) => (
                        <kbd key={idx} className="kbd-keycap">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <footer className="shortcuts-modal-footer">
          <span className="shortcuts-modal-hint">
            💡 Shortcuts are automatically paused when typing inside text boxes.
          </span>
        </footer>
      </div>
    </div>
  );
}

export default ShortcutsModal;
