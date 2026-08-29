export interface AttendanceLocationEvidence {
  accuracyM: number;
  capturedAt: string;
}

export const isAttendanceLocationFresh = (
  location: AttendanceLocationEvidence | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!location || !Number.isFinite(location.accuracyM) || location.accuracyM < 0) return false;
  const capturedAt = new Date(location.capturedAt).getTime();
  if (!Number.isFinite(capturedAt)) return false;
  const ageMs = now.getTime() - capturedAt;
  return ageMs >= -60_000 && ageMs <= 5 * 60_000;
};

