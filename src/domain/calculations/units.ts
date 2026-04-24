export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046226218 * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.2046226218) * 10) / 10;
}

export function mlToOz(ml: number): number {
  return Math.round((ml / 29.5735295625) * 10) / 10;
}

export function ozToMl(oz: number): number {
  return Math.round(oz * 29.5735295625);
}

export function formatLoad(kg: number, unit: 'kg' | 'lb'): string {
  return unit === 'kg' ? `${kg.toFixed(1)} kg` : `${kgToLb(kg).toFixed(1)} lb`;
}
