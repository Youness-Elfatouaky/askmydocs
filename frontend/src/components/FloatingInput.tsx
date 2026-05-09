import { useId, useState } from "react";

type Props = {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  showPasswordToggle?: boolean;
};

export function FloatingInput({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  required,
  showPasswordToggle,
}: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const filled = focused || value.length > 0;
  const effectiveType = showPasswordToggle && revealed ? "text" : type;

  return (
    <div className={`float-field ${filled ? "is-filled" : ""} ${focused ? "is-focused" : ""}`}>
      <input
        id={id}
        type={effectiveType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        required={required}
        spellCheck={false}
      />
      <label htmlFor={id} className="float-label">
        {label}
      </label>
      {showPasswordToggle && (
        <button
          type="button"
          className="reveal-btn"
          onClick={() => setRevealed((r) => !r)}
          tabIndex={-1}
          aria-label={revealed ? "Hide password" : "Show password"}
        >
          {revealed ? "🙈" : "👁"}
        </button>
      )}
    </div>
  );
}
