// Postcode proximity scoring (demo-grade).
// We compare UK outcodes (the bit before the space, e.g. "M20" in "M20 4EF").
// Same outcode = closest, same letters + adjacent number = near, same postcode
// area letters = same town, otherwise far. Good enough to keep cleaners in
// tight patches without a full geocoding service; swap in postcodes.io later
// for real distances.

export function outcode(postcode = '') {
  const pc = String(postcode).trim().toUpperCase().replace(/\s+/g, ' ');
  const first = pc.split(' ')[0];
  return first || '';
}

function parts(oc) {
  const m = /^([A-Z]{1,2})(\d{1,2})/.exec(oc);
  return m ? { area: m[1], district: parseInt(m[2], 10) } : { area: oc, district: null };
}

// Higher = closer. 0-100.
export function proximityScore(postcodeA, postcodeB) {
  const a = outcode(postcodeA), b = outcode(postcodeB);
  if (!a || !b) return 10;
  if (a === b) return 100;
  const pa = parts(a), pb = parts(b);
  if (pa.area === pb.area) {
    if (pa.district !== null && pb.district !== null) {
      const gap = Math.abs(pa.district - pb.district);
      if (gap === 1) return 75;
      if (gap <= 3) return 60;
    }
    return 45; // same town/area letters
  }
  return 15; // different area entirely
}

export function proximityLabel(score) {
  if (score >= 100) return 'same postcode patch';
  if (score >= 60) return 'neighbouring patch';
  if (score >= 45) return 'same town';
  return 'outside usual patch';
}
