'use client';
import { useRef, type ComponentProps } from 'react';
import { Icon } from '../clients/ui.tsx';

type DateInputProps = Omit<ComponentProps<'input'>, 'ref' | 'type'>;

export function DateInput(props: DateInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const syncPicker = () => {
    const match = input.current?.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (picker.current)
      picker.current.value = match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  };
  const openCalendar = () => {
    if (input.current?.matches(':disabled, [readonly]')) return;
    syncPicker();
    try {
      picker.current?.showPicker();
    } catch {
      // Safari also opens the picker when the native input is tapped directly.
    }
  };
  return (
    <span className="date-input-wrap">
      <input
        {...props}
        ref={input}
        type="text"
        data-date-mask=""
        data-date-picker="1"
        onClick={(event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) openCalendar();
        }}
      />
      <input
        ref={picker}
        type="date"
        className="date-input-native"
        aria-label="Abrir calendário"
        aria-describedby={props['aria-describedby']}
        disabled={props.disabled}
        readOnly={props.readOnly}
        onPointerDown={syncPicker}
        onFocus={syncPicker}
        onClick={openCalendar}
        onChange={(event) => {
          const value = event.currentTarget.value;
          const field = input.current;
          if (!field || !value || field.matches(':disabled, [readonly]'))
            return;
          const [year, month, day] = value.split('-');
          // Use the native setter so React receives the change on controlled fields.
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )!.set!.call(field, `${day}/${month}/${year}`);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('blur', { bubbles: true }));
        }}
      />
      <span className="date-input-btn" aria-hidden="true">
        <Icon name="calendar" />
      </span>
    </span>
  );
}
