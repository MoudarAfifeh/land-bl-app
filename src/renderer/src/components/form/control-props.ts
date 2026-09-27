export function errorId(id: string): string {
  return `${id}-error`
}

/** Accessibility props linking a control to its error message. */
export function controlProps(
  id: string,
  error: string | undefined
): { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined } {
  return { id, 'aria-invalid': !!error, 'aria-describedby': error ? errorId(id) : undefined }
}
