import type { CSSProperties } from 'react';
import { SelectField, type SelectFieldOption, type SelectFieldProps } from '@nimiplatform/kit/ui';

export type AppSelectOption = SelectFieldOption;

export interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  /** Text shown when value is ''. */
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  /**
   * Portal layer of the dropdown panel. The default popover layer
   * (--nimi-z-popover: 80) sits below dialogs (--nimi-z-dialog: 90), so a
   * select inside a modal must pass 'dialog' or its options open invisibly
   * behind the modal.
   */
  contentLayer?: SelectFieldProps['contentLayer'];
  style?: CSSProperties;
}

export function AppSelect({ value, onChange, options, placeholder, className, contentLayer, style, 'aria-label': ariaLabel }: AppSelectProps) {
  const select = (
    <SelectField
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      contentLayer={contentLayer}
    />
  );

  if (!style) {
    return select;
  }

  return (
    <div style={style}>
      {select}
    </div>
  );
}
