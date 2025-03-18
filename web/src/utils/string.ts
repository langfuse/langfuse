export function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}

export function truncate(str: string, n: number = 16) {
  // '...' suffix if the string is longer than n
  if (str.length > n) {
    return str.substring(0, n) + "...";
  }
  return str;
}
