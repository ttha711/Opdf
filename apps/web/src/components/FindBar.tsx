import type { RefObject } from "react";

type FindBarProps = {
  searchText: string;
  searchResult: string;
  findInputRef: RefObject<HTMLInputElement>;
  onChangeSearch: (value: string) => void;
  onClose: () => void;
};

export function FindBar({ searchText, searchResult, findInputRef, onChangeSearch, onClose }: FindBarProps) {
  return (
    <div className="find-bar">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={findInputRef}
        className="find-bar-input"
        placeholder="Find in document..."
        value={searchText}
        onChange={e => onChangeSearch(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape") onClose();
        }}
      />
      {searchResult && <span className="find-bar-result">{searchResult}</span>}
      <button className="find-bar-close" onClick={onClose} title="Close (Esc)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
