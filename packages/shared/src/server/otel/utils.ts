export function isValidDateString(dateString: string): boolean {
  return !isNaN(new Date(dateString).getTime());
}
