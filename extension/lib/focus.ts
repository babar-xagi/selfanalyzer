export const practiceFocuses = [
  { value: 'general', label: 'General speaking' },
  { value: 'grammar', label: 'Grammar' },
  { value: 'fluency', label: 'Fluency' },
  { value: 'vocabulary', label: 'Vocabulary' },
] as const;

export type PracticeFocus = (typeof practiceFocuses)[number]['value'];

const storageKey = 'conversation-coach:practice-focus';

export function getPracticeFocus(): PracticeFocus {
  try {
    const stored = localStorage.getItem(storageKey);
    const found = practiceFocuses.find((focus) => focus.value === stored);
    return found?.value ?? 'general';
  } catch {
    return 'general';
  }
}

export function savePracticeFocus(focus: PracticeFocus): void {
  localStorage.setItem(storageKey, focus);
}

export function getPracticeFocusLabel(focus: PracticeFocus): string {
  return practiceFocuses.find((item) => item.value === focus)?.label ?? 'General speaking';
}
