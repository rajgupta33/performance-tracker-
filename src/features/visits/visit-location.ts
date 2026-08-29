import type { CapturedPosition } from './visits.types';

export function geolocationErrorMessage(error: GeolocationPositionError | unknown): string {
  const code = (error as GeolocationPositionError | undefined)?.code;
  if (code === 1) return 'Location permission is blocked. Allow Location for FieldForce in your device settings, then retry.';
  if (code === 2) return 'Your location is unavailable. Turn on GPS and move to an area with a clearer signal.';
  if (code === 3) return 'Location timed out. Move outdoors or turn on Wi-Fi, then retry.';
  return 'FieldForce could not capture your location. Check GPS and try again.';
}

function getPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

export async function captureVisitPosition(): Promise<CapturedPosition> {
  if (!navigator.geolocation) throw new Error('Geolocation is not supported on this device.');

  let position: GeolocationPosition;
  try {
    position = await getPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  } catch (error) {
    const code = (error as GeolocationPositionError | undefined)?.code;
    if (code !== 2 && code !== 3) throw new Error(geolocationErrorMessage(error));
    try {
      position = await getPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
    } catch (fallbackError) {
      throw new Error(geolocationErrorMessage(fallbackError));
    }
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: Math.max(0, position.coords.accuracy),
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}
