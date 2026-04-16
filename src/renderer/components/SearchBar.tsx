import React, { useState } from 'react';

interface Props {
  onSearch: (theme: string, minResults: number) => void;
  isSearching: boolean;
}

export default function SearchBar({ onSearch, isSearching }: Props) {
  const [query, setQuery] = useState('');
  const [minResults, setMinResults] = useState(30);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isSearching) onSearch(query.trim(), minResults);
  };

  const suggestions = [
    'Tinh yeu hoc tro',
    'Nhac buon ve tinh yeu',
    'Bai hat ve me',
    'Nhac xuan vui tuoi',
    'Nhac bolero',
  ];

  const canSearch = !isSearching && query.trim();

  return (
    <div style={{ marginBottom: 20 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        {/* Search input */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nhap chu de bai hat..."
            disabled={isSearching}
            style={{
              width: '100%', padding: '10px 14px', fontSize: 14,
              backgroundColor: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Count input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>SL</span>
          <input
            type="number"
            value={minResults}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 200) setMinResults(v);
            }}
            min={1} max={200}
            disabled={isSearching}
            style={{
              width: 48, padding: '10px 6px', fontSize: 14, textAlign: 'center',
              backgroundColor: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>

        {/* Search button */}
        <button
          type="submit"
          disabled={!canSearch}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 500,
            borderRadius: 'var(--radius-md)', border: 'none', cursor: canSearch ? 'pointer' : 'default',
            backgroundColor: canSearch ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: canSearch ? '#fff' : 'var(--text-tertiary)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (canSearch) e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
          onMouseLeave={(e) => { if (canSearch) e.currentTarget.style.backgroundColor = 'var(--accent)'; }}
          onMouseDown={(e) => { if (canSearch) e.currentTarget.style.backgroundColor = 'var(--accent-active)'; }}
          onMouseUp={(e) => { if (canSearch) e.currentTarget.style.backgroundColor = 'var(--accent-hover)'; }}
        >
          {isSearching ? 'Dang tim...' : 'Tim kiem'}
        </button>
      </form>

      {/* Suggestion chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => { setQuery(s); if (!isSearching) onSearch(s, minResults); }}
            disabled={isSearching}
            style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 100,
              backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
              border: '0.5px solid var(--border)', cursor: isSearching ? 'default' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isSearching) { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
