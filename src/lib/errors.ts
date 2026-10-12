const messages: Record<string, string> = {
  rec: 'The Logger is Recording.',
  notempty: 'Pages are already recorded. Erase first.',
  nand: "The Logger's memory chip is not supported.",
  intan: "No amplifier (INTAN) detected. The Logger can't record.",
  full: 'The Logger is Full. Erase it to record again.',
  rtc: 'This Logger has no clock.',
  fail: 'Self-test failed.',
  unknown: "The Logger doesn't know this command. Update its firmware.",
  timeout: 'The Logger did not answer.',
};

export function errorMessage(token: string): string {
  return messages[token] ?? `Logger error: ${token}`;
}
