import type { JsonObject, ParamFieldSchema } from "@/api/types";

import { readParamValue, writeParamValue } from "./composerDraft";

type ParamFieldsProps = {
  paramsSchema: Record<string, ParamFieldSchema>;
  value: JsonObject;
  onChange: (next: JsonObject) => void;
  disabled?: boolean;
};

export function ParamFields({ paramsSchema, value, onChange, disabled }: ParamFieldsProps) {
  const entries = Object.entries(paramsSchema);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="param-fields">
      {entries.map(([key, field]) => (
        <label key={key} className="field">
          <span>{field.label ?? key}</span>
          <ParamInput
            field={field}
            value={readParamValue(value, key)}
            disabled={disabled}
            onChange={(v) => onChange(writeParamValue(value, key, v))}
          />
        </label>
      ))}
    </div>
  );
}

function ParamInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ParamFieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  if (field.enum && field.enum.length > 0) {
    return (
      <select
        value={String(value ?? field.default ?? field.enum[0])}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {field.enum.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  const inputType = field.type === "integer" || field.type === "number" ? "number" : "text";
  return (
    <input
      type={inputType}
      step={field.type === "integer" ? 1 : "any"}
      min={field.min ?? undefined}
      max={field.max ?? undefined}
      value={value === undefined || value === null ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (field.type === "integer") {
          onChange(raw === "" ? undefined : parseInt(raw, 10));
          return;
        }
        if (field.type === "number") {
          onChange(raw === "" ? undefined : parseFloat(raw));
          return;
        }
        onChange(raw);
      }}
    />
  );
}
