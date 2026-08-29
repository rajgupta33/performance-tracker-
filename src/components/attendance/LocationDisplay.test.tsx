import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocationDisplay } from './LocationDisplay';

describe('LocationDisplay', () => {
  it('shows the captured GPS uncertainty', () => {
    render(
      <LocationDisplay
        location={{ lat: 28.6, lng: 77.2, address: 'New Delhi', accuracyM: 24 }}
        isLocating={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/new delhi · ±24 m/i)).toBeInTheDocument();
  });

  it('asks for a retry when accuracy exceeds the organization limit', () => {
    render(
      <LocationDisplay
        location={{ lat: 28.6, lng: 77.2, address: 'New Delhi', accuracyM: 320 }}
        isLocating={false}
        maxAccuracyM={250}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/need ±250 m or better/i)).toBeInTheDocument();
  });
});

