import React, { useState, useRef, useEffect } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  onSearch?: (query: string) => void;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar...',
  disabled = false,
  onSearch,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display text when value changes externally (e.g. edit mode)
  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  // Notify parent to fetch filtered options
  useEffect(() => {
    if (onSearch && open) onSearch(query);
  }, [query, open]);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (val: string) => {
    onChange(val);
    setQuery(val);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value || query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery(value || '');
          }}
          className={`w-full px-3 py-2 pr-8 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white ${
            disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
          }`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {!value && !disabled && (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </div>
      {open && !disabled && (
        <ul className="absolute z-50 mt-1 w-full max-h-52 overflow-auto bg-white border rounded-lg shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">Sin resultados</li>
          ) : (
            filtered.map((opt) => (
              <li
                key={opt}
                onClick={() => handleSelect(opt)}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                  opt === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                {opt}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
