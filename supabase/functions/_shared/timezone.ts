const partsFormatter = (timeZone: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(timestamp: number, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(timestamp))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values;
}

/** Converts an IANA-zone wall-clock value to its exact UTC instant, including DST. */
export function zonedDateTimeToUtcIso(date: string, time: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) {
    throw new Error('Expected date YYYY-MM-DD and time HH:mm[:ss]');
  }
  // Construct a UTC-shaped guess, measure how the target zone renders it, then
  // correct twice. The second pass handles offset changes near DST boundaries.
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  for (let i = 0; i < 2; i += 1) {
    const rendered = zonedParts(guess, timeZone);
    const renderedAsUtc = Date.UTC(
      rendered.year, rendered.month - 1, rendered.day,
      rendered.hour, rendered.minute, rendered.second,
    );
    guess += desired - renderedAsUtc;
  }
  return new Date(guess).toISOString();
}

