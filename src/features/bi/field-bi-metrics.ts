export const safeRate = (numerator: number, denominator: number) => denominator > 0 ? Math.round(1000 * numerator / denominator) / 10 : 0;
